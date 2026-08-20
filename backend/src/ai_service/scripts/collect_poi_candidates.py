"""Collect unverified Sri Lankan POI candidates from open structured-data sources."""

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
DEFAULT_NATIONWIDE_OUTPUT = DATA_DIR / "staging" / "poi_candidates_sri_lanka_v1.csv"
OVERPASS_URLS = (
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
KANDY_WIKIDATA_ID = "Q723002"
KANDY_OSM_RELATION_ID = 5_351_794
KANDY_OSM_BBOX = "6.938773,80.421896,7.4898505,81.016526"
SRI_LANKA_DISTRICTS = (
    "Ampara",
    "Anuradhapura",
    "Badulla",
    "Batticaloa",
    "Colombo",
    "Galle",
    "Gampaha",
    "Hambantota",
    "Jaffna",
    "Kalutara",
    "Kandy",
    "Kegalle",
    "Kilinochchi",
    "Kurunegala",
    "Mannar",
    "Matale",
    "Matara",
    "Monaragala",
    "Mullaitivu",
    "Nuwara Eliya",
    "Polonnaruwa",
    "Puttalam",
    "Ratnapura",
    "Trincomalee",
    "Vavuniya",
)
DISTRICT_NAME_ALIASES = {
    "Monaragala": {"monaragala", "moneragala"},
    "Mullaitivu": {"mullaitivu", "mullaittivu"},
    "Nuwara Eliya": {"nuwara eliya", "nuwaraeliya"},
}
USER_AGENT = (
    "R26-IT-050-Sri-Lanka-POI-Candidate-Collector/1.1 "
    "(final-year academic research; local research project)"
)
REQUEST_TIMEOUT_SECONDS = 60
MAX_ATTEMPTS = 3
MIN_REQUEST_INTERVAL_SECONDS = 5.0
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
    "district_query_id",
    "district_query_url",
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
    display_url = url.split("?", 1)[0]
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
            message = f"HTTP {error.code} from {display_url}"
            if detail:
                message += f": {detail}"
            if not retryable or attempt == MAX_ATTEMPTS:
                raise RuntimeError(message) from error
            retry_after = error.headers.get("Retry-After", "")
            if retry_after.isdigit():
                delay = min(float(retry_after), 30.0)
            elif error.code == 429:
                delay = min(5.0 * attempt, 15.0)
            else:
                delay = 2 ** (attempt - 1)
            print(f"Warning: {message}; retrying in {delay:g}s", file=sys.stderr)
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt == MAX_ATTEMPTS:
                raise RuntimeError(f"Request failed for {display_url}: {error}") from error
            delay = 2 ** (attempt - 1)
            print(
                f"Warning: request failed for {display_url}: {error}; retrying in {delay}s",
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


def district_slug(district: str) -> str:
    return normalize_name(district).replace(" ", "-")


def canonical_district_name(value: str) -> str | None:
    normalized = normalize_name(value)
    if normalized.endswith(" district"):
        normalized = normalized[: -len(" district")].strip()
    for district in SRI_LANKA_DISTRICTS:
        accepted = {normalize_name(district)} | DISTRICT_NAME_ALIASES.get(district, set())
        if normalized in accepted:
            return district
    return None


def request_overpass(query: str) -> Any:
    """Query a bounded list of public Overpass instances."""
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error: RuntimeError | None = None
    for endpoint in OVERPASS_URLS:
        try:
            return request_json(
                endpoint,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded; charset=utf-8"},
            )
        except RuntimeError as error:
            last_error = error
            print(f"Warning: Overpass endpoint failed: {error}", file=sys.stderr)
    raise RuntimeError(f"all Overpass endpoints failed; last error: {last_error}")


def resolve_osm_districts(
    district_names: Iterable[str],
) -> dict[str, tuple[int, str]]:
    """Resolve official district names to OSM relation IDs and source-provided bounds."""
    requested = set(district_names)
    query = """
[out:json][timeout:25];
relation["boundary"="administrative"]["admin_level"="5"]["ISO3166-2"~"^LK-"];
out tags bb;
""".strip()
    response = request_overpass(query)
    resolved: dict[str, tuple[int, str]] = {}
    for element in response.get("elements", []):
        tags = element.get("tags") or {}
        district = canonical_district_name(tags.get("name:en") or tags.get("name") or "")
        bounds = element.get("bounds") or {}
        relation_id = element.get("id")
        if district not in requested or not isinstance(relation_id, int):
            continue
        coordinates = (
            bounds.get("minlat"),
            bounds.get("minlon"),
            bounds.get("maxlat"),
            bounds.get("maxlon"),
        )
        if any(value is None for value in coordinates):
            continue
        bbox = ",".join(format_coordinate(float(value)) for value in coordinates)
        current = resolved.get(district)
        if current is None or relation_id < current[0]:
            resolved[district] = (relation_id, bbox)
    return resolved


def collect_osm(
    district: str,
    relation_id: int,
    bbox: str,
    collected_at: str,
) -> list[dict[str, str]]:
    """Collect named candidates inside one OSM district administrative area."""
    area_id = 3_600_000_000 + relation_id
    query = f"""
[out:json][timeout:55];
area({area_id})->.district;
(
  nwr(area.district)({bbox})["name"]["tourism"~"^(aquarium|attraction|gallery|museum|theme_park|viewpoint|zoo)$"];
  nwr(area.district)({bbox})["name"]["historic"~"^(archaeological_site|castle|fort|manor|monument|ruins)$"];
  nwr(area.district)({bbox})["name"]["leisure"="nature_reserve"];
  nwr(area.district)({bbox})["name"]["natural"~"^(cave_entrance|hot_spring|peak|waterfall)$"];
);
out tags center qt;
""".strip()
    response = request_overpass(query)

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
        structured_tags["query_district_name"] = district
        structured_tags["query_district_osm_relation_id"] = str(relation_id)
        candidates.append(
            {
                "candidate_id": f"osm-{object_type}-{object_id}",
                "canonical_name": name,
                "latitude": format_coordinate(float(latitude)),
                "longitude": format_coordinate(float(longitude)),
                "categories": osm_categories(tags),
                "district": district,
                "district_query_id": f"relation/{relation_id}",
                "district_query_url": f"https://www.openstreetmap.org/relation/{relation_id}",
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


def resolve_wikidata_districts(district_names: Iterable[str]) -> dict[str, str]:
    """Resolve official district names to Wikidata entities using English labels."""
    requested = list(district_names)
    labels = [
        district + suffix
        for district in requested
        for suffix in (" District", " district")
    ]
    label_values = "\n    ".join(f"{json.dumps(label)}@en" for label in labels)
    query = f"""
SELECT DISTINCT ?district ?districtLabel WHERE {{
  VALUES ?districtLabel {{
    {label_values}
  }}
  ?district rdfs:label ?districtLabel;
            wdt:P17 wd:Q854.
}}
ORDER BY ?district
""".strip()
    url = WIKIDATA_SPARQL_URL + "?" + urllib.parse.urlencode(
        {"query": query, "format": "json"}
    )
    response = request_json(url)
    resolved: dict[str, str] = {}
    for binding in response.get("results", {}).get("bindings", []):
        item_url = binding.get("district", {}).get("value", "")
        entity_id = item_url.rsplit("/", 1)[-1]
        label = binding.get("districtLabel", {}).get("value", "")
        district = canonical_district_name(label)
        if district in requested and re.fullmatch(r"Q\d+", entity_id):
            current = resolved.get(district)
            if current is None or int(entity_id[1:]) < int(current[1:]):
                resolved[district] = entity_id
    return resolved


def collect_wikidata(
    district: str,
    district_wikidata_id: str,
    collected_at: str,
) -> list[dict[str, str]]:
    """Collect coordinate-bearing entities administratively located in one district."""
    query = f"""
SELECT ?item ?itemLabel (SAMPLE(?coordinate) AS ?coord)
       (GROUP_CONCAT(DISTINCT STR(?instance); separator="|") AS ?instance_ids)
       (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="|") AS ?instance_labels)
       (GROUP_CONCAT(DISTINCT STR(?heritageDesignation); separator="|") AS ?heritage_ids)
       (GROUP_CONCAT(DISTINCT ?heritageLabel; separator="|") AS ?heritage_labels)
       (SAMPLE(STR(?article)) AS ?wikipedia_url)
WHERE {{
  ?item wdt:P131+ wd:{district_wikidata_id};
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
            "located_in_district_id": district_wikidata_id,
            "query_district_name": district,
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
                "district": district,
                "district_query_id": district_wikidata_id,
                "district_query_url": (
                    f"https://www.wikidata.org/wiki/{district_wikidata_id}"
                ),
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


def scope_candidate_ids(candidates: list[dict[str, str]], district: str) -> None:
    """Keep repeated boundary source records distinct in nationwide output."""
    suffix = district_slug(district)
    for candidate in candidates:
        candidate["candidate_id"] = f"{candidate['candidate_id']}-{suffix}"


def collect_nationwide(args: argparse.Namespace, collected_at: str) -> int:
    districts = list(args.batch_districts or SRI_LANKA_DISTRICTS)
    osm_metadata: dict[str, tuple[int, str]] = {}
    wikidata_metadata: dict[str, str] = {}
    metadata_failures: dict[str, str] = {}

    if args.source in {"osm", "both"}:
        try:
            osm_metadata = resolve_osm_districts(districts)
            print(f"Resolved {len(osm_metadata)} OSM district boundary record(s).")
        except (RuntimeError, ValueError, TypeError) as error:
            metadata_failures["OpenStreetMap"] = str(error)
            print(f"Error resolving OSM districts: {error}", file=sys.stderr)
    if args.source in {"wikidata", "both"}:
        try:
            wikidata_metadata = resolve_wikidata_districts(districts)
            print(f"Resolved {len(wikidata_metadata)} Wikidata district record(s).")
        except (RuntimeError, ValueError, TypeError) as error:
            metadata_failures["Wikidata"] = str(error)
            print(f"Error resolving Wikidata districts: {error}", file=sys.stderr)

    district_groups: list[list[dict[str, str]]] = []
    failures: list[str] = []
    zero_districts: list[str] = []
    for district in districts:
        source_groups: list[list[dict[str, str]]] = []
        if args.source in {"osm", "both"}:
            metadata = osm_metadata.get(district)
            if metadata is None:
                detail = metadata_failures.get(
                    "OpenStreetMap", "district boundary metadata was not resolved"
                )
                failures.append(f"{district}/OpenStreetMap: {detail}")
            else:
                relation_id, bbox = metadata
                try:
                    rows = collect_osm(
                        district, relation_id, bbox, collected_at
                    )
                    source_groups.append(rows)
                    print(f"{district}: {len(rows)} relevant OpenStreetMap candidate(s).")
                except (RuntimeError, ValueError, TypeError) as error:
                    failures.append(f"{district}/OpenStreetMap: {error}")
                    print(
                        f"Error collecting {district} from OpenStreetMap: {error}",
                        file=sys.stderr,
                    )

        if args.source in {"wikidata", "both"}:
            district_wikidata_id = wikidata_metadata.get(district)
            if district_wikidata_id is None:
                detail = metadata_failures.get(
                    "Wikidata", "district entity metadata was not resolved"
                )
                failures.append(f"{district}/Wikidata: {detail}")
            else:
                try:
                    rows = collect_wikidata(
                        district, district_wikidata_id, collected_at
                    )
                    source_groups.append(rows)
                    print(f"{district}: {len(rows)} relevant Wikidata candidate(s).")
                except (RuntimeError, ValueError, TypeError) as error:
                    failures.append(f"{district}/Wikidata: {error}")
                    print(
                        f"Error collecting {district} from Wikidata: {error}",
                        file=sys.stderr,
                    )

        selected = interleave(source_groups, args.per_district_limit)
        scope_candidate_ids(selected, district)
        district_groups.append(selected)
        if not selected:
            zero_districts.append(district)
        print(
            f"{district}: retained {len(selected)} candidate(s) after the "
            f"per-district limit of {args.per_district_limit}."
        )

    candidates = interleave(district_groups, args.global_limit)
    add_duplicate_markers(candidates)
    output = args.output or DEFAULT_NATIONWIDE_OUTPUT
    write_csv(output, candidates)
    duplicate_rows = sum(bool(row["duplicate_cluster_id"]) for row in candidates)
    print(f"Wrote {len(candidates)} candidate(s) to {output.resolve()}.")
    print(f"Duplicate detection flagged {duplicate_rows} row(s); no rows were merged or deleted.")
    print("Zero-row districts: " + (", ".join(zero_districts) if zero_districts else "none"))
    if failures:
        print("Failed or incomplete district/source collections:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print("Failed or incomplete district/source collections: none")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Collect source-attributed, unverified POI candidates for Kandy or all "
            "25 Sri Lankan districts. "
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
        default=None,
        help=(
            f"Output CSV path (Kandy default: {DEFAULT_OUTPUT}; nationwide default: "
            f"{DEFAULT_NATIONWIDE_OUTPUT})"
        ),
    )
    parser.add_argument(
        "--source",
        choices=("osm", "wikidata", "both"),
        default="both",
        help="Open-data source to query (default: both)",
    )
    parser.add_argument(
        "--all-sri-lanka",
        action="store_true",
        help="Collect a sequential batch across all 25 official districts",
    )
    parser.add_argument(
        "--per-district-limit",
        type=int,
        default=50,
        help="Nationwide maximum rows retained per district after filtering (default: 50)",
    )
    parser.add_argument(
        "--global-limit",
        type=int,
        default=1000,
        help="Nationwide maximum total rows after district filtering (default: 1000)",
    )
    parser.add_argument(
        "--batch-districts",
        nargs="+",
        choices=SRI_LANKA_DISTRICTS,
        help="Optional official-district subset for a batch smoke test",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.batch_districts and not args.all_sri_lanka:
        print("Error: --batch-districts requires --all-sri-lanka.", file=sys.stderr)
        return 2
    if not 1 <= args.per_district_limit <= 500:
        print("Error: --per-district-limit must be between 1 and 500.", file=sys.stderr)
        return 2
    if not 1 <= args.global_limit <= 10_000:
        print("Error: --global-limit must be between 1 and 10000.", file=sys.stderr)
        return 2

    collected_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    if args.all_sri_lanka:
        return collect_nationwide(args, collected_at)

    if args.district.strip().casefold() != "kandy":
        print(
            "Error: this bounded pilot collector supports only --district Kandy.",
            file=sys.stderr,
        )
        return 2
    if not 1 <= args.limit <= 500:
        print("Error: --limit must be between 1 and 500.", file=sys.stderr)
        return 2

    collectors: list[tuple[str, Callable[[], list[dict[str, str]]]]] = []
    if args.source in {"osm", "both"}:
        collectors.append(
            (
                "OpenStreetMap",
                lambda: collect_osm(
                    "Kandy", KANDY_OSM_RELATION_ID, KANDY_OSM_BBOX, collected_at
                ),
            )
        )
    if args.source in {"wikidata", "both"}:
        collectors.append(
            (
                "Wikidata",
                lambda: collect_wikidata("Kandy", KANDY_WIKIDATA_ID, collected_at),
            )
        )

    groups: list[list[dict[str, str]]] = []
    failures: list[str] = []
    for source_name, collector in collectors:
        try:
            rows = collector()
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
    output = args.output or DEFAULT_OUTPUT
    write_csv(output, candidates)
    duplicate_rows = sum(bool(row["duplicate_cluster_id"]) for row in candidates)
    print(f"Wrote {len(candidates)} candidate(s) to {output.resolve()}.")
    print(f"Duplicate detection flagged {duplicate_rows} row(s); no rows were merged or deleted.")
    if failures:
        print("Warning: output is partial because: " + "; ".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
