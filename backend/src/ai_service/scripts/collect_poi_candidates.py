"""Collect unverified Kandy POI candidates from open structured-data sources."""

from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_OUTPUT = DATA_DIR / "staging" / "poi_candidates_kandy_v1.csv"
OVERPASS_URLS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
KANDY_WIKIDATA_ID = "Q723002"
KANDY_OSM_RELATION_ID = 5_351_794
KANDY_OSM_BBOX = "6.938773,80.421896,7.4898505,81.016526"
USER_AGENT = (
    "R26-IT-050-Kandy-POI-Candidate-Collector/1.0 "
    "(final-year academic research; local research project)"
)
REQUEST_TIMEOUT_SECONDS = 30
MAX_ATTEMPTS = 3
MIN_REQUEST_INTERVAL_SECONDS = 1.0
DUPLICATE_DISTANCE_METRES = 250.0
VERIFICATION_STATUS = "candidate_unverified"

ALLOWED_OSM_TOURISM = {
    "aquarium",
    "attraction",
    "gallery",
    "museum",
    "theme_park",
    "viewpoint",
    "zoo",
}
EXCLUDED_OSM_ACCOMMODATION = {
    "camp_site",
    "chalet",
    "guest_house",
    "hostel",
    "hotel",
    "motel",
    "resort",
}
ALLOWED_OSM_HISTORIC = {
    "archaeological_site",
    "castle",
    "fort",
    "manor",
    "monument",
    "ruins",
}
EVIDENCE_TAG_KEYS = {"heritage", "heritage:operator", "wikidata", "wikipedia"}

FIELDNAMES = [
    "candidate_id",
    "canonical_name",
    "latitude",
    "longitude",
    "categories",
    "district",
    "source_name",
    "source_record_id",
    "source_url",
    "source_license",
    "collected_at",
    "raw_source_tags",
    "verification_status",
    "duplicate_cluster_id",
    "duplicate_candidate_ids",
]

OSM_STRUCTURED_TAG_KEYS = {
    "amenity",
    "boundary",
    "denomination",
    "heritage",
    "heritage:operator",
    "historic",
    "leisure",
    "name",
    "name:en",
    "natural",
    "operator",
    "religion",
    "tourism",
    "website",
    "wikidata",
    "wikipedia",
}


class RequestRateLimiter:
    """Enforce a minimum interval between outbound requests."""

    def __init__(self, minimum_interval: float) -> None:
        self.minimum_interval = minimum_interval
        self.last_request_at: float | None = None

    def wait(self) -> None:
        if self.last_request_at is not None:
            remaining = self.minimum_interval - (time.monotonic() - self.last_request_at)
            if remaining > 0:
                time.sleep(remaining)
        self.last_request_at = time.monotonic()


RATE_LIMITER = RequestRateLimiter(MIN_REQUEST_INTERVAL_SECONDS)


def request_json(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> Any:
    """Request JSON with a timeout and bounded exponential retry."""
    request_headers = {
        "Accept": "application/json",
        "User-Agent": USER_AGENT,
    }
    if headers:
        request_headers.update(headers)

    for attempt in range(1, MAX_ATTEMPTS + 1):
        RATE_LIMITER.wait()
        request = urllib.request.Request(url, data=data, headers=request_headers)
        try:
            with urllib.request.urlopen(
                request, timeout=REQUEST_TIMEOUT_SECONDS
            ) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            retryable = error.code in {429, 500, 502, 503, 504}
            detail = error.read(300).decode("utf-8", errors="replace").strip()
            message = f"HTTP {error.code} from {url}"
            if detail:
                message += f": {detail}"
            if not retryable or attempt == MAX_ATTEMPTS:
                raise RuntimeError(message) from error
            retry_after = error.headers.get("Retry-After", "")
            delay = min(float(retry_after), 15.0) if retry_after.isdigit() else 2 ** (attempt - 1)
            print(f"Warning: {message}; retrying in {delay:g}s", file=sys.stderr)
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt == MAX_ATTEMPTS:
                raise RuntimeError(f"Request failed for {url}: {error}") from error
            delay = 2 ** (attempt - 1)
            print(
                f"Warning: request failed for {url}: {error}; retrying in {delay}s",
                file=sys.stderr,
            )
            time.sleep(delay)
    raise AssertionError("unreachable")


def normalize_name(value: str) -> str:
    """Normalize Unicode, case, punctuation, and whitespace for duplicate checks."""
    normalized = unicodedata.normalize("NFKD", value).casefold()
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = "".join(
        char if char.isalnum() or char.isspace() else " " for char in normalized
    )
    return " ".join(normalized.split())


def format_coordinate(value: float) -> str:
    return f"{value:.7f}".rstrip("0").rstrip(".")


def osm_categories(tags: dict[str, str]) -> str:
    category_keys = ("tourism", "historic", "amenity", "leisure", "natural")
    return "|".join(f"{key}={tags[key]}" for key in category_keys if tags.get(key))


def is_relevant_osm_candidate(tags: dict[str, str]) -> bool:
    """Apply conservative, source-tag-based POI relevance rules."""
    tourism = tags.get("tourism", "").strip()
    historic = tags.get("historic", "").strip()
    amenity = tags.get("amenity", "").strip()
    natural = tags.get("natural", "").strip()
    leisure = tags.get("leisure", "").strip()

    if tourism in EXCLUDED_OSM_ACCOMMODATION:
        return False
    if tourism in ALLOWED_OSM_TOURISM:
        return True
    if historic in ALLOWED_OSM_HISTORIC:
        return True
    if leisure == "nature_reserve" or natural == "waterfall":
        return True

    has_supporting_evidence = bool(
        historic
        or tourism in ALLOWED_OSM_TOURISM
        or any(tags.get(key, "").strip() for key in EVIDENCE_TAG_KEYS)
    )
    if amenity == "place_of_worship":
        return has_supporting_evidence
    if natural in {"cave_entrance", "hot_spring", "peak"}:
        return has_supporting_evidence
    return False


def collect_osm(collected_at: str) -> list[dict[str, str]]:
    """Collect named candidates inside the OSM Kandy District administrative area."""
    query = f"""
[out:json][timeout:25];
area({3_600_000_000 + KANDY_OSM_RELATION_ID})->.kandy;
(
  nwr(area.kandy)({KANDY_OSM_BBOX})["name"]["tourism"~"^(aquarium|attraction|gallery|museum|theme_park|viewpoint|zoo)$"];
  nwr(area.kandy)({KANDY_OSM_BBOX})["name"]["historic"~"^(archaeological_site|castle|fort|manor|monument|ruins)$"];
  nwr(area.kandy)({KANDY_OSM_BBOX})["name"]["leisure"="nature_reserve"];
  nwr(area.kandy)({KANDY_OSM_BBOX})["name"]["natural"~"^(cave_entrance|hot_spring|peak|waterfall)$"];
);
out tags center qt;
""".strip()
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    response: Any | None = None
    last_error: RuntimeError | None = None
    for endpoint in OVERPASS_URLS:
        try:
            response = request_json(
                endpoint,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"},
            )
            break
        except RuntimeError as error:
            last_error = error
            print(f"Warning: Overpass endpoint failed: {error}", file=sys.stderr)
    if response is None:
        raise RuntimeError(f"all Overpass endpoints failed; last error: {last_error}")

    candidates: list[dict[str, str]] = []
    for element in response.get("elements", []):
        tags = element.get("tags") or {}
        name = (tags.get("name:en") or tags.get("name") or "").strip()
        latitude = element.get("lat")
        longitude = element.get("lon")
        if latitude is None or longitude is None:
            center = element.get("center") or {}
            latitude = center.get("lat")
            longitude = center.get("lon")
        if (
            not name
            or latitude is None
            or longitude is None
            or not is_relevant_osm_candidate(tags)
        ):
            continue

        object_type = str(element.get("type", ""))
        object_id = str(element.get("id", ""))
        if object_type not in {"node", "way", "relation"} or not object_id:
            continue
        record_id = f"{object_type}/{object_id}"
        structured_tags = {
            key: str(tags[key])
            for key in sorted(OSM_STRUCTURED_TAG_KEYS)
            if key in tags and str(tags[key]).strip()
        }
        candidates.append(
            {
                "candidate_id": f"osm-{object_type}-{object_id}",
                "canonical_name": name,
                "latitude": format_coordinate(float(latitude)),
                "longitude": format_coordinate(float(longitude)),
                "categories": osm_categories(tags),
                "district": "Kandy",
                "source_name": "OpenStreetMap",
                "source_record_id": record_id,
                "source_url": f"https://www.openstreetmap.org/{record_id}",
                "source_license": "ODbL 1.0",
                "collected_at": collected_at,
                "raw_source_tags": json.dumps(
                    structured_tags, ensure_ascii=False, sort_keys=True, separators=(",", ":")
                ),
                "verification_status": VERIFICATION_STATUS,
            }
        )
    return sorted(candidates, key=lambda row: row["candidate_id"])


def parse_wikidata_point(value: str) -> tuple[float, float] | None:
    match = re.fullmatch(r"Point\(([-+0-9.eE]+)\s+([-+0-9.eE]+)\)", value.strip())
    if not match:
        return None
    return float(match.group(2)), float(match.group(1))


def collect_wikidata(collected_at: str) -> list[dict[str, str]]:
    """Collect coordinate-bearing entities administratively located in Kandy District."""
    query = f"""
SELECT ?item ?itemLabel (SAMPLE(?coordinate) AS ?coord)
       (GROUP_CONCAT(DISTINCT STR(?instance); separator="|") AS ?instance_ids)
       (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="|") AS ?instance_labels)
       (GROUP_CONCAT(DISTINCT STR(?heritageDesignation); separator="|") AS ?heritage_ids)
       (GROUP_CONCAT(DISTINCT ?heritageLabel; separator="|") AS ?heritage_labels)
       (SAMPLE(STR(?article)) AS ?wikipedia_url)
WHERE {{
  ?item wdt:P131+ wd:{KANDY_WIKIDATA_ID};
        wdt:P625 ?coordinate;
        wdt:P31 ?instance;
        rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
  OPTIONAL {{
    ?item wdt:P1435 ?heritageDesignation.
    OPTIONAL {{
      ?heritageDesignation rdfs:label ?heritageLabel.
      FILTER(LANG(?heritageLabel) = "en")
    }}
  }}
  OPTIONAL {{
    ?article schema:about ?item;
             schema:isPartOf <https://en.wikipedia.org/>.
  }}
  FILTER(
    EXISTS {{
      VALUES ?strong_class {{
        wd:Q570116  # tourist attraction
        wd:Q33506   # museum
        wd:Q839954  # archaeological site
        wd:Q1081138 # historic site
        wd:Q23790   # natural monument
        wd:Q473972  # protected area
      }}
      ?instance wdt:P279* ?strong_class.
    }}
    || BOUND(?heritageDesignation)
    || (
      BOUND(?article)
      && EXISTS {{
        VALUES ?sitelink_class {{
          wd:Q1370598 # place of worship
          wd:Q8502    # mountain
          wd:Q34038   # waterfall
          wd:Q22698   # park
          wd:Q1107656 # garden
        }}
        ?instance wdt:P279* ?sitelink_class.
      }}
    )
  )
  OPTIONAL {{
    ?instance rdfs:label ?instanceLabel.
    FILTER(LANG(?instanceLabel) = "en")
  }}
}}
GROUP BY ?item ?itemLabel
HAVING(COUNT(DISTINCT ?coordinate) = 1)
ORDER BY ?item
LIMIT 1000
""".strip()
    url = WIKIDATA_SPARQL_URL + "?" + urllib.parse.urlencode(
        {"query": query, "format": "json"}
    )
    response = request_json(url)

    candidates: list[dict[str, str]] = []
    for binding in response.get("results", {}).get("bindings", []):
        item_url = binding.get("item", {}).get("value", "")
        entity_id = item_url.rsplit("/", 1)[-1]
        name = binding.get("itemLabel", {}).get("value", "").strip()
        point = parse_wikidata_point(binding.get("coord", {}).get("value", ""))
        if not re.fullmatch(r"Q\d+", entity_id) or not name or point is None:
            continue
        latitude, longitude = point
        instance_ids = [
            value.rsplit("/", 1)[-1]
            for value in binding.get("instance_ids", {}).get("value", "").split("|")
            if value
        ]
        instance_labels = sorted(
            filter(None, binding.get("instance_labels", {}).get("value", "").split("|"))
        )
        heritage_ids = [
            value.rsplit("/", 1)[-1]
            for value in binding.get("heritage_ids", {}).get("value", "").split("|")
            if value
        ]
        heritage_labels = sorted(
            filter(None, binding.get("heritage_labels", {}).get("value", "").split("|"))
        )
        raw_tags = {
            "heritage_designation_ids": sorted(heritage_ids),
            "heritage_designation_labels": heritage_labels,
            "instance_ids": sorted(instance_ids),
            "instance_labels": instance_labels,
            "located_in_district_id": KANDY_WIKIDATA_ID,
        }
        wikipedia_url = binding.get("wikipedia_url", {}).get("value", "")
        if wikipedia_url:
            raw_tags["wikipedia_url"] = wikipedia_url
        candidates.append(
            {
                "candidate_id": f"wikidata-{entity_id}",
                "canonical_name": name,
                "latitude": format_coordinate(latitude),
                "longitude": format_coordinate(longitude),
                "categories": "|".join(instance_labels),
                "district": "Kandy",
                "source_name": "Wikidata",
                "source_record_id": entity_id,
                "source_url": f"https://www.wikidata.org/wiki/{entity_id}",
                "source_license": "CC0 1.0",
                "collected_at": collected_at,
                "raw_source_tags": json.dumps(
                    raw_tags, ensure_ascii=False, sort_keys=True, separators=(",", ":")
                ),
                "verification_status": VERIFICATION_STATUS,
            }
        )
    return sorted(candidates, key=lambda row: row["candidate_id"])


def haversine_metres(first: dict[str, str], second: dict[str, str]) -> float:
    latitude_1, longitude_1 = map(
        math.radians, (float(first["latitude"]), float(first["longitude"]))
    )
    latitude_2, longitude_2 = map(
        math.radians, (float(second["latitude"]), float(second["longitude"]))
    )
    latitude_delta = latitude_2 - latitude_1
    longitude_delta = longitude_2 - longitude_1
    value = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(latitude_1)
        * math.cos(latitude_2)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 6_371_008.8 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def names_are_similar(first: str, second: str) -> bool:
    """Match normalized names robustly while tolerating a typo or location suffix."""
    normalized_first = normalize_name(first)
    normalized_second = normalize_name(second)
    if not normalized_first or not normalized_second:
        return False

    first_head = normalize_name(first.split(",", 1)[0])
    second_head = normalize_name(second.split(",", 1)[0])
    full_ratio = difflib.SequenceMatcher(None, normalized_first, normalized_second).ratio()
    head_ratio = difflib.SequenceMatcher(None, first_head, second_head).ratio()

    first_tokens = normalized_first.split()
    second_tokens = normalized_second.split()
    shorter, longer = sorted((first_tokens, second_tokens), key=len)
    token_score = 0.0
    if len(shorter) >= 2:
        token_score = sum(
            max(difflib.SequenceMatcher(None, token, other).ratio() for other in longer)
            for token in shorter
        ) / len(shorter)
    return full_ratio >= 0.84 or head_ratio >= 0.84 or token_score >= 0.9


def add_duplicate_markers(candidates: list[dict[str, str]]) -> None:
    """Flag name-similar/proximate clusters while retaining every source record."""
    parents = list(range(len(candidates)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parents[max(first_root, second_root)] = min(first_root, second_root)

    for first in range(len(candidates)):
        for second in range(first + 1, len(candidates)):
            if not names_are_similar(
                candidates[first]["canonical_name"], candidates[second]["canonical_name"]
            ):
                continue
            if haversine_metres(candidates[first], candidates[second]) <= DUPLICATE_DISTANCE_METRES:
                union(first, second)

    clusters: dict[int, list[int]] = {}
    for index in range(len(candidates)):
        clusters.setdefault(find(index), []).append(index)

    for members in clusters.values():
        member_ids = sorted(candidates[index]["candidate_id"] for index in members)
        cluster_id = "" if len(members) == 1 else "dup-" + hashlib.sha256(
            "|".join(member_ids).encode("utf-8")
        ).hexdigest()[:12]
        for index in members:
            current_id = candidates[index]["candidate_id"]
            candidates[index]["duplicate_cluster_id"] = cluster_id
            candidates[index]["duplicate_candidate_ids"] = "|".join(
                candidate_id for candidate_id in member_ids if candidate_id != current_id
            )


def interleave(groups: Iterable[list[dict[str, str]]], limit: int) -> list[dict[str, str]]:
    """Take deterministic round-robin rows so a combined run represents both sources."""
    result: list[dict[str, str]] = []
    queues = [iter(group) for group in groups]
    while queues and len(result) < limit:
        remaining = []
        for queue in queues:
            if len(result) >= limit:
                break
            try:
                result.append(next(queue))
                remaining.append(queue)
            except StopIteration:
                pass
        queues = remaining
    return result


def write_csv(output: Path, candidates: list[dict[str, str]]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(candidates)
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Collect source-attributed, unverified POI candidates for the Kandy pilot. "
            "No candidate is promoted to the verified dataset."
        )
    )
    parser.add_argument(
        "--district",
        default="Kandy",
        help="Pilot district to collect (only Kandy is currently supported; default: Kandy)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum total output rows (1-500; default: 100)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output CSV path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--source",
        choices=("osm", "wikidata", "both"),
        default="both",
        help="Open-data source to query (default: both)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.district.strip().casefold() != "kandy":
        print(
            "Error: this bounded pilot collector supports only --district Kandy.",
            file=sys.stderr,
        )
        return 2
    if not 1 <= args.limit <= 500:
        print("Error: --limit must be between 1 and 500.", file=sys.stderr)
        return 2

    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    collectors: list[tuple[str, Callable[[str], list[dict[str, str]]]]] = []
    if args.source in {"osm", "both"}:
        collectors.append(("OpenStreetMap", collect_osm))
    if args.source in {"wikidata", "both"}:
        collectors.append(("Wikidata", collect_wikidata))

    groups: list[list[dict[str, str]]] = []
    failures: list[str] = []
    for source_name, collector in collectors:
        try:
            rows = collector(collected_at)
            groups.append(rows)
            print(f"Collected {len(rows)} usable candidate(s) from {source_name}.")
        except (RuntimeError, ValueError, TypeError) as error:
            failures.append(f"{source_name}: {error}")
            print(f"Error collecting {source_name}: {error}", file=sys.stderr)

    if not groups:
        print("Error: no source completed; no output was written.", file=sys.stderr)
        return 1

    candidates = interleave(groups, args.limit)
    add_duplicate_markers(candidates)
    write_csv(args.output, candidates)
    duplicate_rows = sum(bool(row["duplicate_cluster_id"]) for row in candidates)
    print(f"Wrote {len(candidates)} candidate(s) to {args.output.resolve()}.")
    print(f"Duplicate detection flagged {duplicate_rows} row(s); no rows were merged or deleted.")
    if failures:
        print("Warning: output is partial because: " + "; ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
