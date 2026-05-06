import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
import warnings
import math
import random
import requests
import json

warnings.filterwarnings('ignore')

# --- GLOBAL DATA LOADING ---
try:
    print("Loading places dataset into memory...")
    PLACES_DF = pd.read_csv('data/places.csv')
    TAGS_ENCODED = PLACES_DF['Tags'].str.get_dummies(sep='|')
    print("Dataset loaded successfully!")
except FileNotFoundError:
    print("Error: 'data/places.csv' not found. Please ensure the file exists in the data directory.")
    PLACES_DF = None
    TAGS_ENCODED = None

# --- HELPER FUNCTIONS ---
def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def format_time_display(total_minutes):
    hours = int(total_minutes // 60)
    mins = int(total_minutes % 60)
    return f"{hours}h {mins}m"

# --- 1. FILTERING (COMPOSITE SCORING: SIMILARITY + PROXIMITY) ---
def filter_locations(user_preferences, user_lat, user_lon, radius_km):
    if PLACES_DF is None: return None

    df_temp = PLACES_DF.copy()
    distances = [calculate_haversine_distance(user_lat, user_lon, row['Latitude'], row['Longitude']) for _, row in df_temp.iterrows()]
    df_temp['Distance_From_Start'] = distances
    
    valid_indices = df_temp[df_temp['Distance_From_Start'] <= radius_km].index
    if len(valid_indices) == 0: return None

    df_radius = df_temp.loc[valid_indices].copy()
    tags_radius = TAGS_ENCODED.loc[valid_indices].copy()

    user_vector = pd.DataFrame(0, index=[0], columns=TAGS_ENCODED.columns)
    for pref in user_preferences:
        if pref in user_vector.columns: user_vector[pref] = 1
            
    similarities = cosine_similarity(user_vector, tags_radius)[0]
    df_radius['Similarity_Score'] = similarities
    
    # --- NEW LOGIC: Composite Score Calculation ---
    # Normalize distance to a 0-1 scale (1 = exactly at start, 0 = at the edge of the radius)
    safe_radius = max(radius_km, 0.1) 
    df_radius['Proximity_Score'] = 1 - (df_radius['Distance_From_Start'] / safe_radius)
    
    # Weights: 70% importance to user preferences, 30% importance to physical closeness
    W_SIMILARITY = 0.7
    W_PROXIMITY = 0.3
    
    df_radius['Composite_Score'] = (df_radius['Similarity_Score'] * W_SIMILARITY) + (df_radius['Proximity_Score'] * W_PROXIMITY)
    
    # Sort by the new Composite Score
    recommended_locations = df_radius[df_radius['Similarity_Score'] > 0].sort_values(by='Composite_Score', ascending=False).reset_index(drop=True)
    
    if recommended_locations.empty:
        recommended_locations = df_radius.sort_values(by='Distance_From_Start').reset_index(drop=True)
        
    return recommended_locations.head(15)


# --- 2. TRUE GENETIC ALGORITHM LOGIC ---
def evaluate_route(route_indices, df, start_lat, start_lon):
    if not route_indices: return 0, 0
    
    total_time_mins = 0
    total_similarity = 0
    TRAFFIC_BUFFER = 1.20 
    AVG_SPEED = 0.5 
    
    first_loc = df.iloc[route_indices[0]]
    dist = calculate_haversine_distance(start_lat, start_lon, first_loc['Latitude'], first_loc['Longitude'])
    total_time_mins += (dist / AVG_SPEED) * TRAFFIC_BUFFER
    
    for i in range(len(route_indices)):
        loc = df.iloc[route_indices[i]]
        total_time_mins += loc['Duration_Minutes'] 
        total_similarity += loc.get('Similarity_Score', 1) 
        
        if i < len(route_indices) - 1:
            next_loc = df.iloc[route_indices[i+1]]
            dist = calculate_haversine_distance(loc['Latitude'], loc['Longitude'], next_loc['Latitude'], next_loc['Longitude'])
            total_time_mins += (dist / AVG_SPEED) * TRAFFIC_BUFFER
            
    return total_time_mins, total_similarity

def run_genetic_algorithm(filtered_df, max_time_minutes, start_lat, start_lon):
    if filtered_df is None or filtered_df.empty: return [], "0h 0m", False

    all_indices = list(range(len(filtered_df)))
    pop_size = 50
    generations = 100
    
    population = []
    for _ in range(pop_size):
        length = random.randint(1, min(6, len(all_indices)))
        route = random.sample(all_indices, length)
        population.append(route)
        
    best_overall_route = []
    best_overall_fitness = -1
    best_overall_time = 0

    for generation in range(generations):
        fitnesses = []
        
        for route in population:
            time, sim = evaluate_route(route, filtered_df, start_lat, start_lon)
            
            if time <= max_time_minutes:
                fitness = sim * 100 
            else:
                fitness = 1 / (time + 1) 
                
            fitnesses.append(fitness)
            
            if fitness > best_overall_fitness and time <= max_time_minutes:
                best_overall_fitness = fitness
                best_overall_route = route
                best_overall_time = time
                
        new_population = [best_overall_route] if best_overall_route else [population[0]] 
        
        while len(new_population) < pop_size:
            tourn1 = random.sample(list(zip(population, fitnesses)), 3)
            parent1 = max(tourn1, key=lambda x: x[1])[0]
            
            tourn2 = random.sample(list(zip(population, fitnesses)), 3)
            parent2 = max(tourn2, key=lambda x: x[1])[0]
            
            split = len(parent1) // 2
            child = parent1[:split].copy()
            for p in parent2:
                if p not in child:
                    child.append(p)
            
            if random.random() < 0.3: 
                mut_type = random.choice(['swap', 'drop', 'add'])
                
                if mut_type == 'swap' and len(child) > 1:
                    idx1, idx2 = random.sample(range(len(child)), 2)
                    child[idx1], child[idx2] = child[idx2], child[idx1]
                    
                elif mut_type == 'drop' and len(child) > 1:
                    child.pop(random.randrange(len(child)))
                    
                elif mut_type == 'add' and len(child) < len(all_indices):
                    available = [x for x in all_indices if x not in child]
                    if available:
                        child.append(random.choice(available))
                        
            new_population.append(child)
            
        population = new_population

    penalty_hit = False
    if not best_overall_route:
        best_overall_route = [min(all_indices, key=lambda x: evaluate_route([x], filtered_df, start_lat, start_lon)[0])]
        best_overall_time, _ = evaluate_route(best_overall_route, filtered_df, start_lat, start_lon)
        penalty_hit = best_overall_time > max_time_minutes
        
    optimal_places = [filtered_df.iloc[idx]['Name'] for idx in best_overall_route]
    formatted_time = format_time_display(best_overall_time)
    
    return optimal_places, formatted_time, penalty_hit

# --- 3. EXPLAINABLE AI (XAI) WITH DIRECT REST API ---
def generate_itinerary_summary(places, preferences, api_key):
    if not places or not api_key:
        return "An optimal route has been generated based on your parameters."
    
    places_str = ", ".join(places)
    pref_str = ", ".join(preferences)
    
    prompt = f"""
    Act as an Explainable AI (XAI) engine for a travel system. 
    User Preferences: {pref_str}.
    Optimized Route: {places_str}.
    
    Task: Write a 3-sentence factual explanation for the user.
    1. Explain that these places were selected because they had the highest Cosine Similarity scores for {pref_str}.
    2. Mention that the Genetic Algorithm optimized the sequence to fit within the time limit while minimizing travel distance.
    3. State that this specific route was chosen as the near-optimal solution compared to other candidates.
    Keep the tone professional and objective.
    """
    
    # Exact model name from your successful cURL command
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            return data['candidates'][0]['content']['parts'][0]['text'].strip()
        else:
            print(f"Gemini REST API Error: {response.text}")
            return "This optimized itinerary perfectly blends your selected interests, taking you through a carefully curated sequence of locations."
            
    except Exception as e:
        print(f"HTTP Request Error: {e}")
        return "This optimized itinerary perfectly blends your selected interests, taking you through a carefully curated sequence of locations."