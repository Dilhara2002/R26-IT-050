import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
import warnings
import math
import random

warnings.filterwarnings('ignore')

# --- GLOBAL DATA LOADING (Software Engineering Fix) ---
# Loading the dataset ONCE when the API starts to prevent bottlenecks
try:
    print("⏳ Loading places dataset into memory...")
    PLACES_DF = pd.read_csv('data/places.csv')
    # Pre-compute one-hot encoded tags globally
    TAGS_ENCODED = PLACES_DF['Tags'].str.get_dummies(sep='|')
    print("✅ Dataset loaded successfully!")
except FileNotFoundError:
    print("❌ Error: 'data/places.csv' not found. Please check the 'data' folder.")
    PLACES_DF = None
    TAGS_ENCODED = None

# --- HELPER FUNCTIONS ---
def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in km
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def format_time_display(total_minutes):
    display_mins = total_minutes
    if display_mins >= 10000:
        display_mins -= 10000
    
    hours = int(display_mins // 60)
    mins = int(display_mins % 60)
    return f"{hours}h {mins}m"

# --- 1. FILTERING (RADIUS + COSINE SIMILARITY) ---
def filter_locations(user_preferences, user_lat, user_lon, radius_km):
    """
    Filters locations within a spatial radius, then ranks them based on 
    Cosine Similarity with the user's preferences.
    """
    if PLACES_DF is None:
        return None

    # Step A: Filter by Radius from Current Location
    distances = []
    for index, row in PLACES_DF.iterrows():
        dist = calculate_haversine_distance(user_lat, user_lon, row['Latitude'], row['Longitude'])
        distances.append(dist)
    
    # Use a temporary dataframe to avoid modifying the global one
    df_temp = PLACES_DF.copy()
    df_temp['Distance_From_Start'] = distances
    
    # Get indices of places within the radius
    valid_indices = df_temp[df_temp['Distance_From_Start'] <= radius_km].index
    
    if len(valid_indices) == 0:
        return None

    df_radius = df_temp.loc[valid_indices].copy()
    tags_radius = TAGS_ENCODED.loc[valid_indices].copy()

    # Step B: Preference Matching using Cosine Similarity
    user_vector = pd.DataFrame(0, index=[0], columns=TAGS_ENCODED.columns)
    for pref in user_preferences:
        if pref in user_vector.columns:
            user_vector[pref] = 1
            
    # Calculate Cosine Similarity
    similarities = cosine_similarity(user_vector, tags_radius)[0]
    df_radius['Similarity_Score'] = similarities
    
    # Filter places that have at least SOME matching preference (score > 0)
    # and sort them from highest match to lowest match
    recommended_locations = df_radius[df_radius['Similarity_Score'] > 0].sort_values(by='Similarity_Score', ascending=False).reset_index(drop=True)
    
    # Fallback: If user selected tags that don't match anything in the radius, 
    # just return the closest places regardless of tags
    if recommended_locations.empty:
        recommended_locations = df_radius.sort_values(by='Distance_From_Start').reset_index(drop=True)
        
    # Return the top 15 best matching places to the GA for optimization
    return recommended_locations.head(15)

# --- 2. CUSTOM GENETIC ALGORITHM LOGIC (To be upgraded next) ---
def calculate_fitness(route_indices, df, max_time_minutes, start_lat, start_lon):
    total_distance_km = 0
    total_duration_minutes = 0
    TRAFFIC_BUFFER_MULTIPLIER = 1.20 
    AVG_SPEED_KM_PER_MIN = 0.5 
    
    first_loc = df.iloc[route_indices[0]]
    dist_to_first = calculate_haversine_distance(start_lat, start_lon, first_loc['Latitude'], first_loc['Longitude'])
    time_to_first = (dist_to_first / AVG_SPEED_KM_PER_MIN) * TRAFFIC_BUFFER_MULTIPLIER
    
    total_distance_km += dist_to_first
    total_duration_minutes += time_to_first
    
    for i in range(len(route_indices) - 1):
        loc1 = df.iloc[route_indices[i]]
        loc2 = df.iloc[route_indices[i+1]]
        
        dist = calculate_haversine_distance(loc1['Latitude'], loc1['Longitude'], loc2['Latitude'], loc2['Longitude'])
        total_distance_km += dist
        
        travel_time = (dist / AVG_SPEED_KM_PER_MIN) * TRAFFIC_BUFFER_MULTIPLIER
        total_duration_minutes += travel_time
        total_duration_minutes += loc1['Duration_Minutes'] 
        
    total_duration_minutes += df.iloc[route_indices[-1]]['Duration_Minutes']
    
    cost = total_duration_minutes
    
    if total_duration_minutes > max_time_minutes:
        cost += 10000 
        
    return cost

def run_genetic_algorithm(filtered_df, max_time_minutes, start_lat, start_lon):
    if filtered_df is None or filtered_df.empty:
        return [], "0h 0m", False

    num_places_to_visit = min(5, len(filtered_df))
    all_indices = list(range(len(filtered_df)))
    
    population = []
    for _ in range(50): 
        route = random.sample(all_indices, num_places_to_visit)
        population.append(route)
        
    best_route = None
    best_cost = float('inf')
    
    for generation in range(100):
        for route in population:
            cost = calculate_fitness(route, filtered_df, max_time_minutes, start_lat, start_lon)
            if cost < best_cost:
                best_cost = cost
                best_route = route
                
        new_population = [best_route]
        while len(new_population) < 50:
            mutated_route = best_route.copy()
            idx1, idx2 = random.sample(range(num_places_to_visit), 2)
            mutated_route[idx1], mutated_route[idx2] = mutated_route[idx2], mutated_route[idx1]
            new_population.append(mutated_route)
            
        population = new_population

    optimal_places = []
    for idx in best_route:
        optimal_places.append(filtered_df.iloc[idx]['Name'])
        
    is_penalty_applied = bool(best_cost >= 10000)
    formatted_time = format_time_display(best_cost)
        
    return optimal_places, formatted_time, is_penalty_applied