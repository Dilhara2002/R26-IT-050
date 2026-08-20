from pathlib import Path
import math
import random
import warnings

import pandas as pd
import requests
from sklearn.metrics.pairwise import cosine_similarity


warnings.filterwarnings("ignore")

QUALITY_THRESHOLD = 3.9
MAX_ROUTE_STOPS = 4
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


def crossover_routes(parent_a, parent_b, valid_indices, rng=None):
    """Ordered crossover combining a prefix from one parent with the other."""
    chooser = rng if rng is not None else random
    parent_a = repair_route(parent_a, valid_indices, chooser)
    parent_b = repair_route(parent_b, valid_indices, chooser)
    target_length = min(
        MAX_ROUTE_STOPS,
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
    return repair_route(child[:target_length], valid_indices, chooser)


def mutate_route(route, valid_indices, rng=None):
    """Explore route membership and ordering while preserving all constraints."""
    chooser = rng if rng is not None else random
    route = repair_route(route, valid_indices, chooser)
    if not route:
        return []

    unused = [index for index in valid_indices if index not in route]
    operations = []
    if len(route) > 1:
        operations.extend(["swap", "remove"])
    if unused:
        operations.append("replace")
        if len(route) < min(MAX_ROUTE_STOPS, len(valid_indices)):
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

    return repair_route(route, valid_indices, chooser)


def _route_fitness(route, df, max_time_minutes, start_lat, start_lon):
    route_time, relevance = evaluate_route(route, df, start_lat, start_lon)
    if route_time > max_time_minutes:
        return 0.0001 / (route_time + 1), route_time
    fitness = (
        (relevance * 100)
        + (len(route) * 10)
        + (1000 / (route_time + 1))
    )
    return fitness, route_time


def _tournament_select(population, fitnesses, rng, tournament_size=3):
    contestants = rng.sample(
        list(zip(population, fitnesses)), min(tournament_size, len(population))
    )
    return max(contestants, key=lambda item: item[1])[0].copy()


def run_genetic_algorithm(
    filtered_df, max_time_minutes, start_lat, start_lon, random_seed=42
):
    """Optimize a unique 1-4 stop route using a deterministic, constrained GA."""
    if filtered_df is None or filtered_df.empty:
        return [], "0h 0m", False

    rng = random.Random(random_seed)
    all_indices = list(range(len(filtered_df)))
    max_stops = min(MAX_ROUTE_STOPS, len(all_indices))
    population_size = 100
    generations = 100
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
                route, filtered_df, max_time_minutes, start_lat, start_lon
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
            child = crossover_routes(parent_a, parent_b, all_indices, rng)
            if rng.random() < 0.35:
                child = mutate_route(child, all_indices, rng)
            new_population.append(repair_route(child, all_indices, rng))
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

    best_route = repair_route(best_route, all_indices, rng)
    optimal_places = [
        f"{filtered_df.iloc[index]['Name']} "
        f"({int(filtered_df.iloc[index]['Duration_Minutes'])} mins)"
        for index in best_route
    ]
    return optimal_places, format_time_display(best_time), penalty_hit


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
