from pathlib import Path
import math
import random
import warnings

import pandas as pd
import requests
from sklearn.metrics.pairwise import cosine_similarity


warnings.filterwarnings("ignore")

QUALITY_THRESHOLD = 3.9
# Defensive guard against excessive GA search and impractically dense itineraries.
MAX_ROUTE_STOPS = 8
TRAFFIC_BUFFER = 1.25
AVERAGE_SPEED_KM_PER_MINUTE = 0.5  # Explicit assumption: about 30 km/h.
DATASET_PATH = Path(__file__).resolve().parent / "data" / "places.csv"

PLACES_DF = None
TAGS_ENCODED = None


def initialize_ai_engine():
    """Load runtime data and tag features without training a quality model."""
    global PLACES_DF, TAGS_ENCODED

    try:
        print(f"[INFO] Loading places dataset from '{DATASET_PATH}'...")
        places = pd.read_csv(DATASET_PATH)
        places["Tags"] = places["Tags"].fillna("General").astype(str)
        # Invalid or absent observations stay missing rather than being imputed.
        places["Rating"] = pd.to_numeric(places["Rating"], errors="coerce")

        PLACES_DF = places
        TAGS_ENCODED = places["Tags"].str.get_dummies(sep="|")
        print("[SUCCESS] AI Engine data initialized; no model training performed.\n")
        return True
    except Exception as exc:
        PLACES_DF = None
        TAGS_ENCODED = None
        print(f"[ERROR] Initialization failed: {exc}")
        return False


# Load immutable runtime inputs once at import/startup; this does not train a model.
initialize_ai_engine()


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


def format_time_display(total_minutes):
    hours = int(total_minutes // 60)
    mins = int(total_minutes % 60)
    return f"{hours}h {mins}m"


def filter_locations(user_preferences, user_lat, user_lon, radius_km=15):
    """Screen by observed quality, then rank by proximity and tag similarity."""
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

    # Expand once as the existing fail-safe for remote starting locations.
    df_radius = places_with_distance[
        places_with_distance["Distance_From_Start"] <= radius_km
    ].copy()
    if df_radius.empty:
        df_radius = places_with_distance[
            places_with_distance["Distance_From_Start"] <= radius_km * 3
        ].copy()
    if df_radius.empty:
        return None

    # This is observed-evidence screening, not an ML prediction. Unknown ratings
    # remain eligible; only observed ratings below the threshold are screened.
    rating_is_eligible = df_radius["Rating"].isna() | (
        df_radius["Rating"] >= QUALITY_THRESHOLD
    )
    df_quality = df_radius[rating_is_eligible].copy()
    if len(df_quality) < 3:
        df_quality = df_radius.copy()

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
    if recommended.empty:
        recommended = df_quality.sort_values(by="Distance_From_Start")

    return recommended.reset_index(drop=True).head(15)


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


def repair_route(route, valid_indices, rng=None, max_stops=MAX_ROUTE_STOPS):
    """Remove invalid/duplicate genes and guarantee a valid non-empty route."""
    valid_indices = list(dict.fromkeys(valid_indices))
    if not valid_indices:
        return []

    valid_set = set(valid_indices)
    repaired = []
    for index in route:
        if index in valid_set and index not in repaired:
            repaired.append(index)
        if len(repaired) == min(max_stops, len(valid_indices)):
            break

    if not repaired:
        chooser = rng if rng is not None else random
        repaired = [chooser.choice(valid_indices)]
    return repaired


def crossover_routes(
    parent_a, parent_b, valid_indices, rng=None, max_stops=MAX_ROUTE_STOPS
):
    """Ordered crossover combining a prefix from one parent with the other."""
    chooser = rng if rng is not None else random
    parent_a = repair_route(parent_a, valid_indices, chooser, max_stops)
    parent_b = repair_route(parent_b, valid_indices, chooser, max_stops)
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
    return repair_route(child[:target_length], valid_indices, chooser, max_stops)


def mutate_route(route, valid_indices, rng=None, max_stops=MAX_ROUTE_STOPS):
    """Explore route membership and ordering while preserving all constraints."""
    chooser = rng if rng is not None else random
    route = repair_route(route, valid_indices, chooser, max_stops)
    if not route:
        return []

    unused = [index for index in valid_indices if index not in route]
    operations = []
    if len(route) > 1:
        operations.extend(["swap", "remove"])
    if unused:
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
        route[chooser.randrange(len(route))] = chooser.choice(unused)
    elif operation == "add":
        route.insert(chooser.randrange(len(route) + 1), chooser.choice(unused))
    elif operation == "remove":
        route.pop(chooser.randrange(len(route)))

    return repair_route(route, valid_indices, chooser, max_stops)


def _route_fitness(
    route, df, max_time_minutes, start_lat, start_lon, route_capacity
):
    route_time, relevance = evaluate_route(route, df, start_lat, start_lon)
    if route_time > max_time_minutes:
        return 0.0001 / (route_time + 1), route_time
    average_relevance = relevance / len(route)
    useful_coverage = relevance / max(1, route_capacity)
    utilization = min(1.0, route_time / max(1, max_time_minutes))
    # Relevance remains dominant. Coverage and utilization reward useful use of
    # available time, while low-score additions can reduce average relevance.
    fitness = (
        (average_relevance * 55)
        + (useful_coverage * 25)
        + (utilization * average_relevance * 20)
    )
    return fitness, route_time


def _tournament_select(population, fitnesses, rng, tournament_size=3):
    contestants = rng.sample(
        list(zip(population, fitnesses)), min(tournament_size, len(population))
    )
    return max(contestants, key=lambda item: item[1])[0].copy()


def _optimize_route_indices(
    filtered_df, max_time_minutes, start_lat, start_lon, random_seed=42
):
    """Optimize unique route indices using a deterministic, constrained GA."""
    if filtered_df is None or filtered_df.empty:
        return [], False

    rng = random.Random(random_seed)
    all_indices = []
    seen_place_ids = set()
    seen_coordinates = set()
    for index in range(len(filtered_df)):
        location = filtered_df.iloc[index]
        place_id = location.get("Place_ID")
        normalized_id = None if place_id is None or pd.isna(place_id) else str(place_id)
        coordinates = (
            float(location["Latitude"]),
            float(location["Longitude"]),
        )
        if (
            (normalized_id is not None and normalized_id in seen_place_ids)
            or coordinates in seen_coordinates
        ):
            continue
        all_indices.append(index)
        if normalized_id is not None:
            seen_place_ids.add(normalized_id)
        seen_coordinates.add(coordinates)
    max_stops = min(
        len(all_indices),
        calculate_route_capacity(
            filtered_df, max_time_minutes, start_lat, start_lon
        ),
    )
    population_size = 80
    generations = 60
    elite_count = 5

    # Seed every singleton so a feasible place cannot be missed by initialization.
    population = [[index] for index in all_indices]
    while len(population) < population_size:
        route_length = rng.randint(1, max_stops)
        population.append(rng.sample(all_indices, route_length))
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
            if route_time <= max_time_minutes and fitness > best_fitness:
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
                parent_a, parent_b, all_indices, rng, max_stops
            )
            if rng.random() < 0.35:
                child = mutate_route(child, all_indices, rng, max_stops)
            new_population.append(
                repair_route(child, all_indices, rng, max_stops)
            )
        population = new_population

    penalty_hit = False
    # Existing graceful fallback: closest/quickest singleton when none is feasible.
    if not best_route:
        best_route = [
            min(
                all_indices,
                key=lambda index: evaluate_route(
                    [index], filtered_df, start_lat, start_lon
                )[0],
            )
        ]
        best_time, _ = evaluate_route(
            best_route, filtered_df, start_lat, start_lon
        )
        penalty_hit = True

    return repair_route(best_route, all_indices, rng, max_stops), penalty_hit


def run_genetic_algorithm_details(
    filtered_df,
    max_time_minutes,
    start_lat,
    start_lon,
    random_seed=42,
    user_preferences=None,
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
        }

    best_route, penalty_hit = _optimize_route_indices(
        filtered_df, max_time_minutes, start_lat, start_lon, random_seed
    )
    details = evaluate_route_details(
        best_route, filtered_df, start_lat, start_lon
    )
    planned_time = details["planned_time_minutes"]
    optimized_stops = []
    for sequence, index in enumerate(best_route, start=1):
        location = filtered_df.iloc[index]
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
            "matched_preferences": matched_preferences,
        }
        optional_fields = {
            "place_id": location.get("Place_ID"),
            "similarity_score": location.get("Similarity_Score"),
            "proximity_score": location.get("Proximity_Score"),
            "composite_score": location.get("Composite_Score"),
        }
        for field, value in optional_fields.items():
            if value is not None and not pd.isna(value):
                if field == "place_id":
                    stop[field] = int(value) if isinstance(value, (int, float)) else str(value)
                else:
                    stop[field] = float(value)
        optimized_stops.append(stop)

    optimal_places = [
        f"{filtered_df.iloc[index]['Name']} "
        f"({int(filtered_df.iloc[index]['Duration_Minutes'])} mins)"
        for index in best_route
    ]
    rounded_planned = int(round(planned_time))
    rounded_visit = int(round(details["visit_time_minutes"]))
    rounded_travel = rounded_planned - rounded_visit
    return {
        "optimized_route": optimal_places,
        "optimized_stops": optimized_stops,
        "estimated_time_required": format_time_display(planned_time),
        "time_limit_exceeded": penalty_hit,
        "planned_time_minutes": rounded_planned,
        "visit_time_minutes": rounded_visit,
        "travel_time_minutes": rounded_travel,
        "remaining_time_minutes": max(0, int(max_time_minutes) - rounded_planned),
        "time_utilization_percent": round(
            (planned_time / max(1, max_time_minutes)) * 100, 1
        ),
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


def generate_itinerary_summary(places, preferences, api_key):
    if not places or not api_key:
        return "Optimal itinerary generated."

    prompt = f"""
    Act strictly as an Explainable AI (XAI) text-formatter for a Context-Aware Spatio-Temporal travel system.
    User Preferences: {', '.join(preferences)}.
    Optimized Route with Allocated Times: {', '.join(places)}.

    Task: Generate a structured summary explaining that locations passed observed-rating quality screening (missing ratings remained eligible), preferences were matched using cosine similarity, and the routing sequence was optimized using a Genetic Algorithm. Keep it engaging and concise.
    """

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-flash-latest:generateContent?key={api_key}"
    )
    try:
        response = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        if response.status_code == 200:
            return response.json()["candidates"][0]["content"]["parts"][0]["text"]
        return "This Context-Aware itinerary blends your selected interests while optimizing for travel time."
    except requests.RequestException:
        return "This Context-Aware itinerary blends your selected interests while optimizing for travel time."
