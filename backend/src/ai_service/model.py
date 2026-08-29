from pathlib import Path
import hashlib
import itertools
import json
import math
import os
import random
import re
import warnings

import joblib
import pandas as pd
import requests
from sklearn.metrics.pairwise import cosine_similarity

from relevance_features import SUPPORTED_INTERESTS, make_pair_frame


warnings.filterwarnings("ignore")

QUALITY_THRESHOLD = 3.9
# Defensive guard against excessive GA search and impractically dense itineraries.
MAX_ROUTE_STOPS = 8
TRAFFIC_BUFFER = 1.25
AVERAGE_SPEED_KM_PER_MINUTE = 0.5  # Explicit assumption: about 30 km/h.
AVERAGE_SPEED_KMH = AVERAGE_SPEED_KM_PER_MINUTE * 60
NEAR_IDENTICAL_COORDINATE_KM = 0.05
DATA_SCOPE = "verified_central_province_v1"
DATASET_VERSION = "central_province_runtime_verified_v1"
SUPPORTED_DISTRICTS = ("Kandy", "Matale", "Nuwara Eliya")
EXPECTED_DISTRICT_COUNTS = {"Kandy": 20, "Matale": 10, "Nuwara Eliya": 10}
CATALOGUE_POI_COUNT = sum(EXPECTED_DISTRICT_COUNTS.values())
VERIFIED_STATUS = "source_trace_verified"
QUARANTINED_LEGACY_IDS = {"79"}
GEMINI_REQUEST_TIMEOUT = (2, 5)
GEMINI_INTERACTIONS_URL = (
    "https://generativelanguage.googleapis.com/v1beta/interactions"
)
DEFAULT_GEMINI_MODEL = "gemini-3.7-flash"
MAX_GEMINI_GUIDE_CHARS = 8000
GEMINI_PLACEHOLDER_KEYS = {
    "APIKEY",
    "CHANGEME",
    "ENTERAPIKEY",
    "ENTERGEMINIAPIKEY",
    "GEMINIAPIKEY",
    "INSERTAPIKEY",
    "PASTEAPIKEY",
    "PASTEGEMINIAPIKEY",
    "PLACEHOLDER",
    "REPLACEWITHYOURAPIKEY",
    "TODO",
    "YOURAPIKEY",
    "YOURAPIKEYHERE",
    "YOURGEMINIAPIKEY",
    "YOURGEMINIAPIKEYHERE",
    "YOURKEYHERE",
}
DATASET_PATH = (
    Path(__file__).resolve().parent
    / "data"
    / "verified"
    / "central_province_runtime_verified_v1.csv"
)
DEFAULT_RELEVANCE_MODEL_PATH = (
    Path(__file__).resolve().parent / "models" / "user_poi_relevance_v1.joblib"
)
RELEVANCE_MODEL_PATH = Path(
    os.environ.get("ITINERARY_RELEVANCE_MODEL_PATH", DEFAULT_RELEVANCE_MODEL_PATH)
)

PLACES_DF = None
TAGS_ENCODED = None
RELEVANCE_PIPELINE = None
RELEVANCE_METADATA = None
PROFILING_MODE = "content_based_fallback"
RELEVANCE_FALLBACK_REASON = "relevance artifact has not been loaded"


def _sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_relevance_artifact(path=None):
    """Load and verify the frozen inference artifact; never fit at runtime."""
    global RELEVANCE_PIPELINE, RELEVANCE_METADATA, PROFILING_MODE
    global RELEVANCE_FALLBACK_REASON

    artifact_path = Path(path or RELEVANCE_MODEL_PATH)
    metadata_path = artifact_path.with_suffix(".metadata.json")
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if _sha256(artifact_path) != metadata["artifact_sha256"]:
            raise ValueError("artifact SHA-256 does not match metadata")
        pipeline = joblib.load(artifact_path)
        if list(map(int, pipeline.classes_)) != [0, 1, 2]:
            raise ValueError("artifact classes are not exactly [0, 1, 2]")
        RELEVANCE_PIPELINE = pipeline
        RELEVANCE_METADATA = metadata
        PROFILING_MODE = "trained_relevance_model"
        RELEVANCE_FALLBACK_REASON = None
        print(
            f"[SUCCESS] Loaded {metadata['model_name']} {metadata['model_version']} "
            f"({metadata['classifier']}); runtime training was not performed."
        )
        return True
    except Exception as exc:
        RELEVANCE_PIPELINE = None
        RELEVANCE_METADATA = None
        PROFILING_MODE = "content_based_fallback"
        RELEVANCE_FALLBACK_REASON = str(exc)
        print(f"[WARNING] Relevance model unavailable; using explicit fallback: {exc}")
        return False


def get_relevance_engine_metadata():
    """Return truthful additive runtime provenance for API and diagnostics."""
    result = {
        "profiling_mode": PROFILING_MODE,
        "runtime_training_performed": False,
        "runtime_role": "candidate relevance gate before 70/30 ranking and GA",
    }
    if RELEVANCE_METADATA:
        result.update(
            {
                "model_name": RELEVANCE_METADATA.get("model_name"),
                "model_version": RELEVANCE_METADATA.get("model_version"),
                "classifier": RELEVANCE_METADATA.get("classifier"),
                "artifact_sha256": RELEVANCE_METADATA.get("artifact_sha256"),
                "score_semantics": (
                    "predicted-class confidence; not calibrated user-satisfaction probability"
                ),
            }
        )
    else:
        result["fallback_reason"] = RELEVANCE_FALLBACK_REASON
    return result


def initialize_ai_engine():
    """Load immutable POIs and the frozen artifact without runtime training."""
    global PLACES_DF, TAGS_ENCODED

    try:
        print(f"[INFO] Loading places dataset from '{DATASET_PATH}'...")
        places = pd.read_csv(DATASET_PATH)
        required_columns = {
            "Place_ID",
            "Legacy_Place_ID",
            "Name",
            "Latitude",
            "Longitude",
            "District",
            "Tags",
            "Duration_Minutes",
            "Duration_Basis",
            "Source_Name",
            "Source_URL",
            "Source_License",
            "Verification_Status",
            "Verification_Note",
        }
        missing_columns = required_columns.difference(places.columns)
        if missing_columns:
            raise ValueError(
                f"Verified runtime dataset is missing columns: {sorted(missing_columns)}"
            )

        places["Place_ID"] = places["Place_ID"].astype(str)
        places["Legacy_Place_ID"] = places["Legacy_Place_ID"].astype(str)
        places["Tags"] = places["Tags"].fillna("General").astype(str)
        places["Latitude"] = pd.to_numeric(places["Latitude"], errors="raise")
        places["Longitude"] = pd.to_numeric(places["Longitude"], errors="raise")
        places["Duration_Minutes"] = pd.to_numeric(
            places["Duration_Minutes"], errors="raise"
        )
        # Ratings have no provenance in this overlay and remain missing.
        places["Rating"] = pd.to_numeric(places["Rating"], errors="coerce")

        district_counts = places["District"].value_counts().to_dict()
        if district_counts != EXPECTED_DISTRICT_COUNTS:
            raise ValueError(
                "Verified Central Province runtime district counts differ from "
                f"{EXPECTED_DISTRICT_COUNTS}: {district_counts}."
            )
        if not places["Verification_Status"].eq(VERIFIED_STATUS).all():
            raise ValueError("Runtime data contains a record without source verification.")
        if places["Place_ID"].duplicated().any():
            raise ValueError("Verified runtime data contains duplicate stable IDs.")
        if places["Name"].fillna("").astype(str).str.strip().str.casefold().duplicated().any():
            raise ValueError("Verified runtime data contains duplicate canonical names.")
        if places["Legacy_Place_ID"].isin(QUARANTINED_LEGACY_IDS).any():
            raise ValueError("A quarantined prototype record entered verified runtime data.")
        for column in (
            "Name",
            "Source_Name",
            "Source_URL",
            "Source_License",
            "Verification_Note",
            "Duration_Basis",
        ):
            if places[column].fillna("").astype(str).str.strip().eq("").any():
                raise ValueError(f"Verified runtime data contains a blank {column}.")

        allowed_tags = set(SUPPORTED_INTERESTS)
        for _, place in places.iterrows():
            tags = {
                token.strip().lower()
                for token in str(place["Tags"]).split("|")
                if token.strip()
            }
            if not tags or not tags.issubset(allowed_tags):
                raise ValueError(
                    f"Verified runtime POI {place['Place_ID']} uses unsupported tags: "
                    f"{sorted(tags - allowed_tags)}."
                )
            if not (
                math.isfinite(place["Latitude"])
                and math.isfinite(place["Longitude"])
                and math.isfinite(place["Duration_Minutes"])
                and -90 <= place["Latitude"] <= 90
                and -180 <= place["Longitude"] <= 180
                and place["Duration_Minutes"] > 0
            ):
                raise ValueError(
                    f"Verified runtime POI {place['Place_ID']} has invalid coordinates or duration."
                )

        for first_index in range(len(places)):
            for second_index in range(first_index + 1, len(places)):
                first = places.iloc[first_index]
                second = places.iloc[second_index]
                if calculate_haversine_distance(
                    first["Latitude"],
                    first["Longitude"],
                    second["Latitude"],
                    second["Longitude"],
                ) < NEAR_IDENTICAL_COORDINATE_KM:
                    raise ValueError(
                        "Verified runtime data contains near-identical coordinates: "
                        f"{first['Place_ID']} and {second['Place_ID']}."
                    )

        PLACES_DF = places
        TAGS_ENCODED = places["Tags"].str.get_dummies(sep="|")
        print(
            f"[SUCCESS] Loaded {len(places)} source-traced Central Province POIs "
            f"across {', '.join(SUPPORTED_DISTRICTS)}; "
            "no model training performed.\n"
        )
        load_relevance_artifact()
        return True
    except Exception as exc:
        PLACES_DF = None
        TAGS_ENCODED = None
        print(f"[ERROR] Initialization failed: {exc}")
        return False


def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    radius_km = 6371.0
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


# Load immutable runtime inputs once at import/startup; this does not train a model.
initialize_ai_engine()


def format_time_display(total_minutes):
    rounded_minutes = max(0, int(round(total_minutes)))
    hours, mins = divmod(rounded_minutes, 60)
    return f"{hours}h {mins}m"


def _drop_duplicate_places(places):
    """Keep the first ranked record for each ID or near-identical coordinate."""
    kept_indices = []
    seen_ids = set()
    kept_coordinates = []
    for index, row in places.iterrows():
        place_id = str(row.get("Place_ID", "")).strip()
        latitude = float(row["Latitude"])
        longitude = float(row["Longitude"])
        coordinate_duplicate = any(
            calculate_haversine_distance(latitude, longitude, kept_lat, kept_lon)
            < NEAR_IDENTICAL_COORDINATE_KM
            for kept_lat, kept_lon in kept_coordinates
        )
        if (place_id and place_id in seen_ids) or coordinate_duplicate:
            continue
        kept_indices.append(index)
        if place_id:
            seen_ids.add(place_id)
        kept_coordinates.append((latitude, longitude))
    return places.loc[kept_indices].copy()


def filter_locations(
    user_preferences,
    user_lat,
    user_lon,
    radius_km=15,
    excluded_place_ids=None,
    locked_place_ids=None,
):
    """Rank only source-traced Central Province POIs inside the active radius."""
    if PLACES_DF is None or TAGS_ENCODED is None:
        return None

    distances = [
        calculate_haversine_distance(
            user_lat, user_lon, row["Latitude"], row["Longitude"]
        )
        for _, row in PLACES_DF.iterrows()
    ]
    places_with_distance = PLACES_DF.copy()
    places_with_distance["Distance_From_Start"] = distances

    df_radius = places_with_distance[
        places_with_distance["Distance_From_Start"] <= radius_km
    ].copy()
    if df_radius.empty:
        return None

    excluded_ids = {str(value).strip() for value in (excluded_place_ids or [])}
    locked_ids = [str(value).strip() for value in (locked_place_ids or [])]
    if excluded_ids:
        df_radius = df_radius[
            ~df_radius["Place_ID"].astype(str).isin(excluded_ids)
        ].copy()
    if df_radius.empty:
        return None

    if "Verification_Status" in df_radius.columns:
        df_radius = df_radius[
            df_radius["Verification_Status"] == VERIFIED_STATUS
        ].copy()
    if "Legacy_Place_ID" in df_radius.columns:
        df_radius = df_radius[
            ~df_radius["Legacy_Place_ID"].astype(str).isin(QUARANTINED_LEGACY_IDS)
        ].copy()
    if df_radius.empty:
        return None

    # This is observed-evidence screening, not an ML prediction. Unknown ratings
    # remain eligible; only observed ratings below the threshold are screened.
    rating_is_eligible = df_radius["Rating"].isna() | (
        df_radius["Rating"] >= QUALITY_THRESHOLD
    )
    df_quality = df_radius[rating_is_eligible].copy()
    if df_quality.empty:
        return None

    valid_indices = df_quality.index
    tags_radius = TAGS_ENCODED.loc[valid_indices].copy()

    # Preference matching uses cosine similarity over pipe-delimited tag features.
    user_vector = pd.DataFrame(0, index=[0], columns=TAGS_ENCODED.columns)
    normalized_preferences = {str(pref).lower() for pref in user_preferences}
    for column in user_vector.columns:
        if column.lower() in normalized_preferences:
            user_vector[column] = 1

    df_quality["Similarity_Score"] = cosine_similarity(
        user_vector, tags_radius
    )[0]

    if RELEVANCE_PIPELINE is not None:
        pairs = make_pair_frame(user_preferences, df_quality["Tags"].tolist())
        predictions = RELEVANCE_PIPELINE.predict(pairs).astype(int)
        probabilities = RELEVANCE_PIPELINE.predict_proba(pairs)
        class_positions = {
            int(label): position
            for position, label in enumerate(RELEVANCE_PIPELINE.classes_)
        }
        df_quality["Predicted_Relevance_Class"] = predictions
        df_quality["Relevance_Classification_Score"] = [
            float(probabilities[row, class_positions[int(label)]])
            for row, label in enumerate(predictions)
        ]
        df_quality = df_quality[df_quality["Predicted_Relevance_Class"] > 0].copy()
        if df_quality.empty:
            return None
        valid_indices = df_quality.index
        tags_radius = TAGS_ENCODED.loc[valid_indices].copy()
        user_vector = user_vector.reindex(columns=tags_radius.columns, fill_value=0)
        df_quality["Similarity_Score"] = cosine_similarity(
            user_vector, tags_radius
        )[0]
    else:
        # The fallback deliberately retains the pre-model eligibility behaviour.
        df_quality["Predicted_Relevance_Class"] = pd.NA
        df_quality["Relevance_Classification_Score"] = pd.NA

    safe_radius = max(df_quality["Distance_From_Start"].max(), 0.1)
    df_quality["Proximity_Score"] = 1 - (
        df_quality["Distance_From_Start"] / safe_radius
    )
    # Declared architecture: 70% spatial proximity, 30% semantic similarity.
    df_quality["Composite_Score"] = (
        df_quality["Proximity_Score"] * 0.70
        + df_quality["Similarity_Score"] * 0.30
    )

    recommended = df_quality[df_quality["Similarity_Score"] > 0].sort_values(
        by="Composite_Score", ascending=False
    )
    locked_rows = df_quality[
        df_quality["Place_ID"].astype(str).isin(locked_ids)
    ].copy()
    if recommended.empty and locked_rows.empty:
        return None
    # Locked rows lead the bounded frame so they cannot be truncated by the
    # candidate cap. The GA may still reorder them while preserving their set.
    combined = pd.concat(
        [locked_rows, recommended[~recommended.index.isin(locked_rows.index)]],
        axis=0,
    )
    return _drop_duplicate_places(combined).reset_index(drop=True).head(15)


def evaluate_route(route_indices, df, start_lat, start_lon):
    """Return route minutes and summed relevance under explicit traffic assumptions."""
    if not route_indices:
        return 0, 0

    total_time_mins = 0.0
    total_relevance = 0.0
    first_loc = df.iloc[route_indices[0]]
    distance = calculate_haversine_distance(
        start_lat, start_lon, first_loc["Latitude"], first_loc["Longitude"]
    )
    total_time_mins += (
        distance / AVERAGE_SPEED_KM_PER_MINUTE
    ) * TRAFFIC_BUFFER

    for position, route_index in enumerate(route_indices):
        location = df.iloc[route_index]
        total_time_mins += float(location["Duration_Minutes"])
        relevance = location.get(
            "Composite_Score", location.get("Similarity_Score", 1.0)
        )
        total_relevance += 0.0 if pd.isna(relevance) else float(relevance)

        if position < len(route_indices) - 1:
            next_location = df.iloc[route_indices[position + 1]]
            distance = calculate_haversine_distance(
                location["Latitude"],
                location["Longitude"],
                next_location["Latitude"],
                next_location["Longitude"],
            )
            total_time_mins += (
                distance / AVERAGE_SPEED_KM_PER_MINUTE
            ) * TRAFFIC_BUFFER

    return total_time_mins, total_relevance


def evaluate_route_details(route_indices, df, start_lat, start_lon):
    """Return internally consistent visit, estimated travel and relevance totals."""
    if not route_indices:
        return {
            "planned_time_minutes": 0.0,
            "visit_time_minutes": 0.0,
            "travel_time_minutes": 0.0,
            "relevance": 0.0,
        }

    visit_time = sum(
        float(df.iloc[index]["Duration_Minutes"]) for index in route_indices
    )
    planned_time, relevance = evaluate_route(
        route_indices, df, start_lat, start_lon
    )
    return {
        "planned_time_minutes": planned_time,
        "visit_time_minutes": visit_time,
        "travel_time_minutes": max(0.0, planned_time - visit_time),
        "relevance": relevance,
    }


def calculate_route_capacity(df, max_time_minutes, start_lat, start_lon):
    """Estimate a time-aware search limit, with a defensive maximum of eight."""
    if df is None or df.empty:
        return 0

    # Each estimate includes its visit plus travel from the start. Sorting these
    # gives a deterministic, conservative indication of how many stops the budget
    # can reasonably support while still allowing the GA to choose fewer.
    service_estimates = []
    for index in range(len(df)):
        location = df.iloc[index]
        travel_minutes = (
            calculate_haversine_distance(
                start_lat,
                start_lon,
                location["Latitude"],
                location["Longitude"],
            )
            / AVERAGE_SPEED_KM_PER_MINUTE
        ) * TRAFFIC_BUFFER
        service_estimates.append(
            float(location["Duration_Minutes"]) + travel_minutes
        )

    capacity = 0
    running_estimate = 0.0
    for estimate in sorted(service_estimates):
        if running_estimate + estimate > max_time_minutes:
            break
        running_estimate += estimate
        capacity += 1

    return min(MAX_ROUTE_STOPS, len(df), max(1, capacity))


def repair_route(
    route,
    valid_indices,
    rng=None,
    max_stops=MAX_ROUTE_STOPS,
    locked_indices=None,
):
    """Repair membership while retaining every locked index and unique stop."""
    valid_indices = list(dict.fromkeys(valid_indices))
    if not valid_indices:
        return []

    valid_set = set(valid_indices)
    locked = [
        index
        for index in dict.fromkeys(locked_indices or [])
        if index in valid_set
    ]
    if len(locked) > max_stops:
        return []
    repaired = []
    for index in route:
        if index in valid_set and index not in repaired:
            repaired.append(index)

    for index in locked:
        if index not in repaired:
            repaired.append(index)

    # Preserve the accepted stops' relative order from the request while still
    # allowing unlocked alternatives to move around them during optimization.
    locked_positions = [
        position for position, index in enumerate(repaired) if index in set(locked)
    ]
    for position, locked_index in zip(locked_positions, locked):
        repaired[position] = locked_index

    if len(repaired) > max_stops:
        removable = [index for index in repaired if index not in set(locked)]
        while len(repaired) > max_stops and removable:
            removed = removable.pop()
            repaired.remove(removed)

    if not repaired:
        chooser = rng if rng is not None else random
        repaired = [chooser.choice(valid_indices)]
    return repaired


def crossover_routes(
    parent_a,
    parent_b,
    valid_indices,
    rng=None,
    max_stops=MAX_ROUTE_STOPS,
    locked_indices=None,
):
    """Ordered crossover combining a prefix from one parent with the other."""
    chooser = rng if rng is not None else random
    parent_a = repair_route(
        parent_a, valid_indices, chooser, max_stops, locked_indices
    )
    parent_b = repair_route(
        parent_b, valid_indices, chooser, max_stops, locked_indices
    )
    target_length = min(
        max_stops,
        len(set(parent_a + parent_b)),
        max(
            1,
            chooser.randint(
                min(len(parent_a), len(parent_b)),
                max(len(parent_a), len(parent_b)),
            ),
        ),
    )
    # When the child can hold multiple genes, reserve room for parent B so this
    # is a genuine two-parent operator rather than a parent clone.
    maximum_cut = min(len(parent_a), target_length - 1)
    cut = chooser.randint(1, maximum_cut) if maximum_cut >= 1 else 1
    child = parent_a[:cut]
    child.extend(index for index in parent_b if index not in child)
    if len(child) < target_length:
        unused = [index for index in valid_indices if index not in child]
        chooser.shuffle(unused)
        child.extend(unused[: target_length - len(child)])
    return repair_route(
        child[:target_length], valid_indices, chooser, max_stops, locked_indices
    )


def mutate_route(
    route,
    valid_indices,
    rng=None,
    max_stops=MAX_ROUTE_STOPS,
    locked_indices=None,
):
    """Explore route membership and ordering while preserving all constraints."""
    chooser = rng if rng is not None else random
    route = repair_route(
        route, valid_indices, chooser, max_stops, locked_indices
    )
    if not route:
        return []

    unused = [index for index in valid_indices if index not in route]
    operations = []
    locked_set = set(locked_indices or [])
    mutable_positions = [
        position for position, index in enumerate(route) if index not in locked_set
    ]
    if len(route) > 1:
        operations.append("swap")
    if mutable_positions:
        operations.append("remove")
    if unused:
        if mutable_positions:
            operations.append("replace")
        if len(route) < min(max_stops, len(valid_indices)):
            operations.append("add")
    if not operations:
        return route

    operation = chooser.choice(operations)
    if operation == "swap":
        first, second = chooser.sample(range(len(route)), 2)
        route[first], route[second] = route[second], route[first]
    elif operation == "replace":
        route[chooser.choice(mutable_positions)] = chooser.choice(unused)
    elif operation == "add":
        route.insert(chooser.randrange(len(route) + 1), chooser.choice(unused))
    elif operation == "remove":
        route.pop(chooser.choice(mutable_positions))

    return repair_route(
        route, valid_indices, chooser, max_stops, locked_indices
    )


def _route_fitness(
    route, df, max_time_minutes, start_lat, start_lon, route_capacity
):
    details = evaluate_route_details(route, df, start_lat, start_lon)
    route_time = details["planned_time_minutes"]
    relevance = details["relevance"]
    if route_time > max_time_minutes:
        return 0.0001 / (route_time + 1), route_time
    average_relevance = relevance / len(route)
    useful_coverage = relevance / max(1, route_capacity)
    visit_utilization = min(
        1.0, details["visit_time_minutes"] / max(1, max_time_minutes)
    )
    travel_fraction = details["travel_time_minutes"] / max(1, max_time_minutes)
    # Relevance remains dominant. Only visit time rewards useful budget use;
    # additional travel is always a penalty and can never improve fitness.
    fitness = (
        (average_relevance * 55)
        + (useful_coverage * 25)
        + (visit_utilization * average_relevance * 20)
        - (travel_fraction * 20)
    )
    return fitness, route_time


def _stable_place_id_key(index, df):
    value = str(df.iloc[index].get("Place_ID", "")).strip()
    try:
        return (0, int(value), value)
    except ValueError:
        return (1, value, value)


def route_travel_distance_km(route_indices, df, start_lat, start_lon):
    """Return consecutive-leg Haversine distance for an open route."""
    total = 0.0
    previous_latitude, previous_longitude = start_lat, start_lon
    for index in route_indices:
        location = df.iloc[index]
        total += calculate_haversine_distance(
            previous_latitude,
            previous_longitude,
            location["Latitude"],
            location["Longitude"],
        )
        previous_latitude = location["Latitude"]
        previous_longitude = location["Longitude"]
    return total


def minimum_open_path_order(route_indices, df, start_lat, start_lon):
    """Find the exact minimum-distance open path with a stable POI-ID tie-break."""
    unique_indices = list(dict.fromkeys(route_indices))
    if len(unique_indices) < 2:
        return unique_indices
    coordinates = {
        index: (
            float(df.iloc[index]["Latitude"]),
            float(df.iloc[index]["Longitude"]),
        )
        for index in unique_indices
    }
    start_distances = {
        index: calculate_haversine_distance(
            start_lat, start_lon, *coordinates[index]
        )
        for index in unique_indices
    }
    leg_distances = {
        (first, second): calculate_haversine_distance(
            *coordinates[first], *coordinates[second]
        )
        for first in unique_indices
        for second in unique_indices
        if first != second
    }
    position = {index: bit for bit, index in enumerate(unique_indices)}
    states = {
        (1 << position[index], index): (start_distances[index], (index,))
        for index in unique_indices
    }
    for mask_size in range(2, len(unique_indices) + 1):
        for mask in range(1, 1 << len(unique_indices)):
            if mask.bit_count() != mask_size:
                continue
            for last in unique_indices:
                last_bit = 1 << position[last]
                if not mask & last_bit:
                    continue
                previous_mask = mask ^ last_bit
                candidates = []
                for previous in unique_indices:
                    state = states.get((previous_mask, previous))
                    if state is None:
                        continue
                    candidates.append(
                        (state[0] + leg_distances[(previous, last)], state[1] + (last,))
                    )
                if candidates:
                    states[(mask, last)] = min(
                        candidates,
                        key=lambda item: (
                            round(item[0], 12),
                            tuple(_stable_place_id_key(index, df) for index in item[1]),
                        ),
                    )
    full_mask = (1 << len(unique_indices)) - 1
    return list(
        min(
            (states[(full_mask, last)] for last in unique_indices),
            key=lambda item: (
                round(item[0], 12),
                tuple(_stable_place_id_key(index, df) for index in item[1]),
            ),
        )[1]
    )


def minimum_replacement_insertion_order(
    route_indices, df, start_lat, start_lon, locked_place_ids
):
    """Keep accepted-stop order and insert the replacement at minimum travel cost."""
    locked_ids = [str(value).strip() for value in (locked_place_ids or [])]
    index_by_id = {
        str(df.iloc[index].get("Place_ID", "")).strip(): index
        for index in route_indices
    }
    locked_indices = [index_by_id[value] for value in locked_ids if value in index_by_id]
    locked_set = set(locked_indices)
    replacements = [index for index in route_indices if index not in locked_set]
    if len(replacements) != 1:
        return minimum_open_path_order(route_indices, df, start_lat, start_lon)
    replacement = replacements[0]
    candidates = []
    for position in range(len(locked_indices) + 1):
        candidate = locked_indices.copy()
        candidate.insert(position, replacement)
        candidates.append(candidate)
    return min(
        candidates,
        key=lambda route: (
            round(route_travel_distance_km(route, df, start_lat, start_lon), 12),
            route.index(replacement),
            tuple(_stable_place_id_key(index, df) for index in route),
        ),
    )


def find_best_full_regeneration_route(
    filtered_df,
    max_time_minutes,
    start_lat,
    start_lon,
    target_stop_count,
    recent_plan_signatures=None,
):
    """Return the best feasible unseen fixed-size set in exact open-path order."""
    if (
        filtered_df is None
        or filtered_df.empty
        or not isinstance(target_stop_count, int)
        or target_stop_count < 1
        or target_stop_count > min(MAX_ROUTE_STOPS, len(filtered_df))
    ):
        return []

    indices = list(range(len(filtered_df)))
    positions = list(range(len(indices)))
    coordinates = {
        position: (
            float(filtered_df.iloc[index]["Latitude"]),
            float(filtered_df.iloc[index]["Longitude"]),
        )
        for position, index in enumerate(indices)
    }
    start_distances = {
        position: calculate_haversine_distance(
            start_lat, start_lon, *coordinates[position]
        )
        for position in positions
    }
    leg_distances = {
        (first, second): calculate_haversine_distance(
            *coordinates[first], *coordinates[second]
        )
        for first in positions
        for second in positions
        if first != second
    }
    states = {
        (1 << position, position): (start_distances[position], (position,))
        for position in positions
    }
    for size in range(2, target_stop_count + 1):
        for subset in itertools.combinations(positions, size):
            mask = sum(1 << position for position in subset)
            for last in subset:
                previous_mask = mask ^ (1 << last)
                candidates = []
                for previous in subset:
                    if previous == last:
                        continue
                    previous_state = states.get((previous_mask, previous))
                    if previous_state is None:
                        continue
                    candidates.append(
                        (
                            previous_state[0] + leg_distances[(previous, last)],
                            previous_state[1] + (last,),
                        )
                    )
                states[(mask, last)] = min(
                    candidates,
                    key=lambda item: (
                        round(item[0], 12),
                        tuple(
                            _stable_place_id_key(indices[position], filtered_df)
                            for position in item[1]
                        ),
                    ),
                )

    forbidden = {
        tuple(sorted(str(value).strip() for value in signature))
        for signature in (recent_plan_signatures or [])
    }
    best = None
    for subset in itertools.combinations(positions, target_stop_count):
        mask = sum(1 << position for position in subset)
        _, ordered_positions = min(
            (states[(mask, last)] for last in subset),
            key=lambda item: (
                round(item[0], 12),
                tuple(
                    _stable_place_id_key(indices[position], filtered_df)
                    for position in item[1]
                ),
            ),
        )
        route = [indices[position] for position in ordered_positions]
        signature = tuple(
            sorted(str(filtered_df.iloc[index]["Place_ID"]).strip() for index in route)
        )
        if signature in forbidden:
            continue
        fitness, route_time = _route_fitness(
            route,
            filtered_df,
            max_time_minutes,
            start_lat,
            start_lon,
            target_stop_count,
        )
        if route_time > max_time_minutes:
            continue
        tie_break = (
            -round(fitness, 12),
            round(route_time, 12),
            signature,
            tuple(_stable_place_id_key(index, filtered_df) for index in route),
        )
        if best is None or tie_break < best[0]:
            best = (tie_break, route)
    return [] if best is None else best[1]


def _tournament_select(population, fitnesses, rng, tournament_size=3):
    contestants = rng.sample(
        list(zip(population, fitnesses)), min(tournament_size, len(population))
    )
    return max(contestants, key=lambda item: item[1])[0].copy()


def _optimize_route_indices(
    filtered_df,
    max_time_minutes,
    start_lat,
    start_lon,
    random_seed=42,
    locked_place_ids=None,
    excluded_place_ids=None,
    minimum_route_stops=1,
    maximum_route_stops=MAX_ROUTE_STOPS,
):
    """Optimize unique route indices using a deterministic, constrained GA."""
    if filtered_df is None or filtered_df.empty:
        return [], False

    rng = random.Random(random_seed)
    locked_ids = [str(value).strip() for value in (locked_place_ids or [])]
    excluded_ids = {str(value).strip() for value in (excluded_place_ids or [])}
    all_indices = []
    index_by_place_id = {}
    seen_place_ids = set()
    seen_coordinates = []
    for index in range(len(filtered_df)):
        location = filtered_df.iloc[index]
        place_id = location.get("Place_ID")
        normalized_id = None if place_id is None or pd.isna(place_id) else str(place_id)
        coordinates = (
            float(location["Latitude"]),
            float(location["Longitude"]),
        )
        coordinate_duplicate = any(
            calculate_haversine_distance(
                coordinates[0], coordinates[1], kept_latitude, kept_longitude
            )
            < NEAR_IDENTICAL_COORDINATE_KM
            for kept_latitude, kept_longitude in seen_coordinates
        )
        if (
            (normalized_id is not None and normalized_id in seen_place_ids)
            or (normalized_id is not None and normalized_id in excluded_ids)
            or coordinate_duplicate
        ):
            continue
        all_indices.append(index)
        if normalized_id is not None:
            seen_place_ids.add(normalized_id)
            index_by_place_id[normalized_id] = index
        seen_coordinates.append(coordinates)
    if not all_indices:
        return [], True

    if any(place_id not in index_by_place_id for place_id in locked_ids):
        return [], True
    locked_indices = [index_by_place_id[place_id] for place_id in locked_ids]
    required_stops = max(len(locked_indices), int(minimum_route_stops))
    max_stops = min(
        len(all_indices),
        max(1, int(maximum_route_stops)),
        MAX_ROUTE_STOPS,
        max(
            required_stops,
            len(locked_indices),
            calculate_route_capacity(
                filtered_df, max_time_minutes, start_lat, start_lon
            ),
        ),
    )
    if required_stops > len(all_indices) or required_stops > max_stops:
        return [], True
    population_size = 80
    generations = 60
    elite_count = 5

    # Seed locked-plus-candidate routes so any feasible replacement cannot be
    # missed by randomized initialization.
    population = []
    for index in all_indices:
        seed_route = list(locked_indices)
        if index not in seed_route:
            seed_route.append(index)
        remaining = [
            candidate
            for candidate in all_indices
            if candidate not in seed_route
        ]
        seed_route.extend(remaining[: max(0, required_stops - len(seed_route))])
        population.append(
            repair_route(
                seed_route,
                all_indices,
                rng,
                max_stops,
                locked_indices,
            )
        )
    while len(population) < population_size:
        route_length = rng.randint(required_stops, max_stops)
        unlocked_indices = [
            index for index in all_indices if index not in set(locked_indices)
        ]
        chosen_unlocked = rng.sample(
            unlocked_indices,
            min(route_length - len(locked_indices), len(unlocked_indices)),
        )
        route = list(locked_indices) + chosen_unlocked
        rng.shuffle(route)
        population.append(
            repair_route(route, all_indices, rng, max_stops, locked_indices)
        )
    population = population[:population_size]

    best_route = []
    best_fitness = -1.0
    best_time = 0.0

    for _ in range(generations):
        evaluated = [
            _route_fitness(
                route,
                filtered_df,
                max_time_minutes,
                start_lat,
                start_lon,
                max_stops,
            )
            for route in population
        ]
        fitnesses = [item[0] for item in evaluated]

        for route, (fitness, route_time) in zip(population, evaluated):
            if (
                len(route) >= required_stops
                and set(locked_indices).issubset(route)
                and route_time <= max_time_minutes
                and fitness > best_fitness
            ):
                best_route = route.copy()
                best_fitness = fitness
                best_time = route_time

        ranked = sorted(
            zip(population, fitnesses), key=lambda item: item[1], reverse=True
        )
        # Elitism preserves the best candidates unchanged between generations.
        new_population = [route.copy() for route, _ in ranked[:elite_count]]
        while len(new_population) < population_size:
            parent_a = _tournament_select(population, fitnesses, rng)
            parent_b = _tournament_select(population, fitnesses, rng)
            child = crossover_routes(
                parent_a,
                parent_b,
                all_indices,
                rng,
                max_stops,
                locked_indices,
            )
            if rng.random() < 0.35:
                child = mutate_route(
                    child, all_indices, rng, max_stops, locked_indices
                )
            new_population.append(
                repair_route(
                    child, all_indices, rng, max_stops, locked_indices
                )
            )
        population = new_population

    penalty_hit = False
    # Fail closed instead of returning an over-budget or constraint-breaking route.
    if not best_route:
        return [], True

    return (
        repair_route(
            best_route, all_indices, rng, max_stops, locked_indices
        ),
        penalty_hit,
    )


def _text_metadata(location, field, fallback):
    value = location.get(field, fallback)
    if value is None or pd.isna(value) or not str(value).strip():
        return fallback
    return str(value).strip()


def build_stop_explanation(stop):
    """Build a deterministic evidence trace without an external language model."""
    matched = stop.get("matched_preferences") or []
    matched_text = ", ".join(matched) if matched else "no declared preference"
    similarity = stop.get("similarity_score")
    proximity = stop.get("proximity_score")
    composite = stop.get("composite_score")
    score_text = (
        f"similarity {similarity:.3f}, proximity {proximity:.3f}, "
        f"composite {composite:.3f}"
        if all(value is not None for value in (similarity, proximity, composite))
        else "ranking scores unavailable"
    )
    verification = stop.get("verification_status", "verification metadata unavailable")
    duration_basis = stop.get("duration_basis", "unspecified estimate")
    relevance_class = stop.get("predicted_relevance_class")
    relevance_score = stop.get("relevance_classification_score")
    if relevance_class is None:
        relevance_text = "content-based fallback eligibility was used"
    else:
        relevance_text = (
            f"trained relevance class {relevance_class} with classification "
            f"score {relevance_score:.3f} (not a user-satisfaction probability)"
        )
    return (
        f"Stop {stop['sequence']} passed {relevance_text}, matched {matched_text}; "
        f"{score_text}. "
        f"Its incoming consecutive leg is {stop['leg_distance_km']:.2f} km "
        f"straight-line. The {stop['duration_minutes']}-minute visit is labelled "
        f"{duration_basis}; source status: {verification}."
    )


def build_route_explanation(
    optimized_stops,
    user_preferences,
    planned_time_minutes,
    visit_time_minutes,
    travel_time_minutes,
    utilization_percent,
):
    """Describe the bounded data scope, time evidence and heuristic selection."""
    interests = ", ".join(user_preferences or []) or "none"
    summary = (
        f"The {PROFILING_MODE} relevance stage gated candidates, then a heuristic "
        f"genetic algorithm selected {len(optimized_stops)} stop(s) for {interests} "
        f"from the {DATA_SCOPE} source-traced dataset. "
        f"The plan uses {planned_time_minutes} minutes: {visit_time_minutes} for "
        f"research-estimated visits and {travel_time_minutes} for estimated travel "
        f"({utilization_percent:.1f}% utilization). Travel uses straight-line "
        f"Haversine distance, an assumed {AVERAGE_SPEED_KMH:.0f} km/h speed and a "
        f"{TRAFFIC_BUFFER:.2f} traffic buffer; it is not real-road or live-traffic routing."
    )
    return {
        "summary": summary,
        "selection_method": "deterministic_seeded_genetic_algorithm_heuristic",
        "selection_stages": [
            "trained_relevance_gate_or_explicit_content_fallback",
            "fixed_70_percent_proximity_30_percent_cosine_ranking",
            "deterministic_seeded_genetic_algorithm_selects_stop_set",
            "exact_minimum_haversine_open_path_orders_selected_set",
        ],
        "is_globally_optimal": False,
        "data_scope": DATA_SCOPE,
        "selected_interests": list(user_preferences or []),
        "stop_count": len(optimized_stops),
        "planned_time_minutes": planned_time_minutes,
        "visit_time_minutes": visit_time_minutes,
        "estimated_travel_time_minutes": travel_time_minutes,
        "time_utilization_percent": utilization_percent,
    }


def run_genetic_algorithm_details(
    filtered_df,
    max_time_minutes,
    start_lat,
    start_lon,
    random_seed=42,
    user_preferences=None,
    locked_place_ids=None,
    excluded_place_ids=None,
    minimum_route_stops=1,
    maximum_route_stops=MAX_ROUTE_STOPS,
    route_indices_override=None,
):
    """Return the optimized route plus additive structured/time metadata."""
    if filtered_df is None or filtered_df.empty:
        return {
            "optimized_route": [],
            "optimized_stops": [],
            "estimated_time_required": "0h 0m",
            "time_limit_exceeded": False,
            "planned_time_minutes": 0,
            "visit_time_minutes": 0,
            "travel_time_minutes": 0,
            "remaining_time_minutes": max(0, int(max_time_minutes)),
            "time_utilization_percent": 0.0,
            "route_explanation": build_route_explanation(
                [], user_preferences, 0, 0, 0, 0.0
            ),
            "travel_estimation": {
                "method": "haversine_straight_line",
                "assumed_average_speed_kmh": AVERAGE_SPEED_KMH,
                "traffic_buffer": TRAFFIC_BUFFER,
                "includes_return_to_start": False,
                "includes_live_traffic": False,
            },
        }

    if route_indices_override is None:
        best_route, penalty_hit = _optimize_route_indices(
            filtered_df,
            max_time_minutes,
            start_lat,
            start_lon,
            random_seed,
            locked_place_ids=locked_place_ids,
            excluded_place_ids=excluded_place_ids,
            minimum_route_stops=minimum_route_stops,
            maximum_route_stops=maximum_route_stops,
        )
    else:
        best_route = list(route_indices_override)
        penalty_hit = False
    if locked_place_ids:
        best_route = minimum_replacement_insertion_order(
            best_route,
            filtered_df,
            start_lat,
            start_lon,
            locked_place_ids,
        )
    else:
        best_route = minimum_open_path_order(
            best_route, filtered_df, start_lat, start_lon
        )
    details = evaluate_route_details(
        best_route, filtered_df, start_lat, start_lon
    )
    planned_time = details["planned_time_minutes"]
    optimized_stops = []
    previous_latitude, previous_longitude = start_lat, start_lon
    for sequence, index in enumerate(best_route, start=1):
        location = filtered_df.iloc[index]
        leg_distance_km = calculate_haversine_distance(
            previous_latitude,
            previous_longitude,
            location["Latitude"],
            location["Longitude"],
        )
        leg_travel_minutes = (
            leg_distance_km / AVERAGE_SPEED_KM_PER_MINUTE
        ) * TRAFFIC_BUFFER
        tags = [
            tag.strip()
            for tag in str(location.get("Tags", "")).split("|")
            if tag.strip()
        ]
        normalized_preferences = {
            str(preference).lower(): str(preference)
            for preference in (user_preferences or [])
        }
        matched_preferences = [
            normalized_preferences[tag.lower()]
            for tag in tags
            if tag.lower() in normalized_preferences
        ]
        stop = {
            "sequence": sequence,
            "name": str(location["Name"]),
            "latitude": float(location["Latitude"]),
            "longitude": float(location["Longitude"]),
            "duration_minutes": int(location["Duration_Minutes"]),
            "distance_from_start_km": float(
                location.get(
                    "Distance_From_Start",
                    calculate_haversine_distance(
                        start_lat,
                        start_lon,
                        location["Latitude"],
                        location["Longitude"],
                    ),
                )
            ),
            "leg_distance_km": float(leg_distance_km),
            "estimated_leg_travel_minutes": float(leg_travel_minutes),
            "matched_preferences": matched_preferences,
            "verification_status": _text_metadata(
                location, "Verification_Status", "verification metadata unavailable"
            ),
            "source_name": _text_metadata(
                location, "Source_Name", "source metadata unavailable"
            ),
            "source_url": _text_metadata(location, "Source_URL", ""),
            "source_license": _text_metadata(
                location, "Source_License", "license metadata unavailable"
            ),
            "duration_basis": _text_metadata(
                location, "Duration_Basis", "unspecified estimate"
            ),
        }
        optional_fields = {
            "place_id": location.get("Place_ID"),
            "similarity_score": location.get("Similarity_Score"),
            "proximity_score": location.get("Proximity_Score"),
            "composite_score": location.get("Composite_Score"),
            "predicted_relevance_class": location.get("Predicted_Relevance_Class"),
            "relevance_classification_score": location.get(
                "Relevance_Classification_Score"
            ),
        }
        for field, value in optional_fields.items():
            if value is not None and not pd.isna(value):
                if field == "place_id":
                    stop[field] = int(value) if isinstance(value, (int, float)) else str(value)
                elif field == "predicted_relevance_class":
                    stop[field] = int(value)
                else:
                    stop[field] = float(value)
        stop["explanation"] = build_stop_explanation(stop)
        optimized_stops.append(stop)
        previous_latitude = location["Latitude"]
        previous_longitude = location["Longitude"]

    optimal_places = [
        f"{filtered_df.iloc[index]['Name']} "
        f"({int(filtered_df.iloc[index]['Duration_Minutes'])} mins)"
        for index in best_route
    ]
    rounded_planned = int(round(planned_time))
    rounded_visit = int(round(details["visit_time_minutes"]))
    rounded_travel = rounded_planned - rounded_visit
    utilization_percent = round(
        (rounded_planned / max(1, max_time_minutes)) * 100, 1
    )
    return {
        "optimized_route": optimal_places,
        "optimized_stops": optimized_stops,
        "estimated_time_required": format_time_display(rounded_planned),
        "time_limit_exceeded": penalty_hit,
        "planned_time_minutes": rounded_planned,
        "visit_time_minutes": rounded_visit,
        "travel_time_minutes": rounded_travel,
        "remaining_time_minutes": max(0, int(max_time_minutes) - rounded_planned),
        "time_utilization_percent": utilization_percent,
        "route_explanation": build_route_explanation(
            optimized_stops,
            user_preferences,
            rounded_planned,
            rounded_visit,
            rounded_travel,
            utilization_percent,
        ),
        "travel_estimation": {
            "method": "haversine_straight_line",
            "assumed_average_speed_kmh": AVERAGE_SPEED_KMH,
            "traffic_buffer": TRAFFIC_BUFFER,
            "includes_return_to_start": False,
            "includes_live_traffic": False,
            "includes_opening_hours": False,
            "includes_parking_or_walking": False,
        },
    }


def run_genetic_algorithm(
    filtered_df, max_time_minutes, start_lat, start_lon, random_seed=42
):
    """Preserve the existing route/time/penalty API for external callers."""
    result = run_genetic_algorithm_details(
        filtered_df, max_time_minutes, start_lat, start_lon, random_seed
    )
    return (
        result["optimized_route"],
        result["estimated_time_required"],
        result["time_limit_exceeded"],
    )


def _is_usable_gemini_key(api_key):
    if not isinstance(api_key, str) or not api_key.strip():
        return False
    normalized = re.sub(r"[^A-Z0-9]", "", api_key.upper())
    return normalized not in GEMINI_PLACEHOLDER_KEYS


def _final_gemini_model_output(payload):
    """Return bounded text from the final valid Interactions model-output step."""
    if not isinstance(payload, dict) or not isinstance(payload.get("outputs"), list):
        return None

    final_text = None
    for step in payload["outputs"]:
        if not isinstance(step, dict) or step.get("type") != "model_output":
            continue
        content = step.get("content")
        if not isinstance(content, list) or not content:
            continue
        text_parts = []
        valid = True
        for part in content:
            if (
                not isinstance(part, dict)
                or part.get("type") not in {"text", "output_text"}
                or not isinstance(part.get("text"), str)
                or not part["text"].strip()
            ):
                valid = False
                break
            text_parts.append(part["text"].strip())
        candidate = "\n".join(text_parts).strip() if valid else ""
        if candidate and len(candidate) <= MAX_GEMINI_GUIDE_CHARS:
            final_text = candidate
    return final_text


def generate_itinerary_summary(places, preferences, api_key, core_summary=None):
    """Optionally paraphrase a deterministic explanation; never replace its evidence."""
    deterministic_summary = core_summary or (
        f"A heuristic itinerary contains {len(places or [])} stop(s) for "
        f"{', '.join(preferences or []) or 'the selected interests'}."
    )
    if not places or not _is_usable_gemini_key(api_key):
        return None

    prompt = f"""
    Paraphrase the following deterministic itinerary explanation without adding facts,
    claims of optimality, real-road routing, live traffic, opening hours, or observed
    duration evidence. Preserve every limitation and number.

    Evidence: {deterministic_summary}
    """

    configured_model = os.environ.get("GEMINI_MODEL", "").strip()
    gemini_model = configured_model or DEFAULT_GEMINI_MODEL
    try:
        response = requests.post(
            GEMINI_INTERACTIONS_URL,
            headers={
                "x-goog-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={"model": gemini_model, "input": prompt, "store": False},
            timeout=GEMINI_REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return _final_gemini_model_output(response.json())
    except (requests.RequestException, ValueError, TypeError):
        return None
