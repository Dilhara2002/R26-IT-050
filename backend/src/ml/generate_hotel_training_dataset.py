import pandas as pd
import random
import math

HOTEL_CSV = "SLTDA_Master_Dataset_Updated_Coords.csv"
ACTIVITY_CSV = "Activities-Rag.csv"
OUTPUT_CSV = "package_quality_training_data.csv"

# LOAD DATASETS
hotels = pd.read_csv(HOTEL_CSV)
activities = pd.read_csv(ACTIVITY_CSV)

# CLEAN COLUMN NAMES
hotels.columns = hotels.columns.str.strip()
activities.columns = activities.columns.str.strip()

print("HOTEL COLUMNS:", hotels.columns.tolist())
print("ACTIVITY COLUMNS:", activities.columns.tolist())

# HOTEL COLUMN NAMES
HOTEL_DISTRICT_COL = "District"
HOTEL_LAT_COL = "Latitude"
HOTEL_LON_COL = "Logitiute"

# ACTIVITY COLUMN NAMES
ACTIVITY_DISTRICT_COL = "District"
ACTIVITY_LAT_COL = "Latitude"
ACTIVITY_LON_COL = "Longitude"
ACTIVITY_DURATION_COL = "Duration_Hours"

# DISTANCE CALCULATION
def calculate_distance(lat1, lon1, lat2, lon2):
    try:
        lat1 = float(lat1)
        lon1 = float(lon1)
        lat2 = float(lat2)
        lon2 = float(lon2)

        return math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) * 111
    except:
        return 999

training_rows = []

# GENERATE 1000 SYNTHETIC PACKAGES
for _ in range(1000):

    # RANDOM HOTEL
    hotel = hotels.sample(1).iloc[0]

    hotel_district = hotel[HOTEL_DISTRICT_COL]

    # MATCH ACTIVITIES BY DISTRICT
    district_activities = activities[
        activities[ACTIVITY_DISTRICT_COL].astype(str).str.lower()
        == str(hotel_district).lower()
    ]

    if len(district_activities) == 0:
        continue

    # RANDOM ACTIVITY SELECTION
    selected_activities = district_activities.sample(
        min(random.randint(1, 5), len(district_activities))
    )

    # DISTANCE SCORE
    distances = []

    for _, activity in selected_activities.iterrows():

        dist = calculate_distance(
            hotel[HOTEL_LAT_COL],
            hotel[HOTEL_LON_COL],
            activity[ACTIVITY_LAT_COL],
            activity[ACTIVITY_LON_COL],
        )

        distances.append(dist)

    avg_distance = sum(distances) / len(distances)

    if avg_distance <= 10:
        distance_score = random.uniform(0.8, 1.0)

    elif avg_distance <= 30:
        distance_score = random.uniform(0.5, 0.79)

    else:
        distance_score = random.uniform(0.1, 0.49)

    # TIME FEASIBILITY
    total_hours = selected_activities[ACTIVITY_DURATION_COL].sum()

    if total_hours <= 8:
        time_feasibility = random.uniform(0.8, 1.0)

    elif total_hours <= 16:
        time_feasibility = random.uniform(0.5, 0.79)

    else:
        time_feasibility = random.uniform(0.2, 0.49)

    # OTHER FEATURE SCORES
    preference_match = random.uniform(0.6, 1.0)

    graph_strength = random.uniform(0.5, 1.0)

    activity_relevance = random.uniform(0.5, 1.0)

    hotel_suitability = random.uniform(0.5, 1.0)

    food_compatibility = random.uniform(0.7, 1.0)

    # PACKAGE BALANCE
    activity_count = len(selected_activities)

    if activity_count <= 3:
        package_balance = random.uniform(0.7, 1.0)

    else:
        package_balance = random.uniform(0.3, 0.7)

    # FINAL QUALITY SCORE
    quality_score = (
        distance_score * 15
        + time_feasibility * 15
        + preference_match * 25
        + graph_strength * 10
        + activity_relevance * 10
        + hotel_suitability * 10
        + food_compatibility * 5
        + package_balance * 10
    )

    # SAVE ROW
    training_rows.append({
        "distanceScore": round(distance_score, 3),
        "timeFeasibility": round(time_feasibility, 3),
        "preferenceMatch": round(preference_match, 3),
        "graphStrength": round(graph_strength, 3),
        "activityRelevance": round(activity_relevance, 3),
        "hotelSuitability": round(hotel_suitability, 3),
        "foodCompatibility": round(food_compatibility, 3),
        "packageBalance": round(package_balance, 3),
        "qualityScore": round(quality_score, 2),
    })

# CREATE DATAFRAME
df = pd.DataFrame(training_rows)

# SAVE CSV
df.to_csv(OUTPUT_CSV, index=False)

print("\nTraining dataset generated successfully!")
print("Rows Generated:", len(df))

print("\nSample Data:")
print(df.head())