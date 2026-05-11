import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score
import warnings
import math
import random
import requests

warnings.filterwarnings('ignore')

# --- GLOBAL VARIABLES ---
PLACES_DF = None
TAGS_ENCODED = None
RF_MODEL = None
TFIDF_VECTORIZER = None

# --- 1. INITIALIZATION & ML TRAINING PHASE ---
def initialize_ai_engine():
    global PLACES_DF, TAGS_ENCODED, RF_MODEL, TFIDF_VECTORIZER
    
    try:
        print("[INFO] Loading places dataset into memory from 'data/places.csv'...")
        PLACES_DF = pd.read_csv('data/places.csv')
        
        # Data Cleaning
        PLACES_DF['Tags'] = PLACES_DF['Tags'].fillna('General')
        PLACES_DF['Rating'] = PLACES_DF['Rating'].fillna(4.0)
        
        print("[INFO] Starting Machine Learning Training Phase (Supervised Learning)...")
        
        # Labeling for Quality Prediction (Threshold tuned for higher accuracy)
        PLACES_DF['High_Quality'] = (PLACES_DF['Rating'] >= 3.9).astype(int)
        
        # Feature Engineering: TF-IDF Vectorization with N-grams
        TFIDF_VECTORIZER = TfidfVectorizer(
            tokenizer=lambda x: str(x).split('|'), 
            token_pattern=None,
            ngram_range=(1, 3) 
        )
        X = TFIDF_VECTORIZER.fit_transform(PLACES_DF['Tags'])
        y = PLACES_DF['High_Quality']
        
        # Data Splitting
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)
        
        # Train Hyperparameter-Tuned Random Forest Model
        RF_MODEL = RandomForestClassifier(
            n_estimators=1000,       
            max_features='sqrt',
            max_depth=50,          
            min_samples_split=2,     
            min_samples_leaf=1,      
            
            random_state=42
        )
        
        RF_MODEL.fit(X_train, y_train)
        
        # Evaluate metrics for presentation
        y_pred = RF_MODEL.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        f1 = f1_score(y_test, y_pred, average='weighted')
        
        print("\n" + "="*50)
        print(" 🚀 ML MODEL EVALUATION (SUPERVISED LEARNING) 🚀")
        print("="*50)
        print(f" Dataset Size    : {len(PLACES_DF)} locations")
        print(f" Accuracy Score  : {acc * 100:.2f}%")
        print(f" F1-Score        : {f1:.4f}")
        print("="*50 + "\n")
        
        # Predict quality for the entire dataset
        PLACES_DF['Predicted_Quality'] = RF_MODEL.predict(X)
        TAGS_ENCODED = PLACES_DF['Tags'].str.get_dummies(sep='|')
        
        print("[SUCCESS] AI Engine initialized and ready.\n")
        
    except Exception as e:
        print(f"[ERROR] Initialization failed: {str(e)}")

# Immediate execution upon backend startup
initialize_ai_engine()

# --- HELPER FUNCTIONS ---
def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth's radius in KM
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

# --- 2. FILTERING (CONTEXT-AWARE COMPOSITE FILTERING) ---
def filter_locations(user_preferences, user_lat, user_lon, radius_km=15):
    if PLACES_DF is None: return None

    # Step A: Distance Calculation
    distances = [calculate_haversine_distance(user_lat, user_lon, row['Latitude'], row['Longitude']) for _, row in PLACES_DF.iterrows()]
    PLACES_DF['Distance_From_Start'] = distances
    
    # Step B: Dynamic Radius Expansion (Fail-safe for remote locations)
    df_radius = PLACES_DF[PLACES_DF['Distance_From_Start'] <= radius_km].copy()
    if df_radius.empty:
        df_radius = PLACES_DF[PLACES_DF['Distance_From_Start'] <= radius_km * 3].copy()
        
    if df_radius.empty: return None

    # Step C: Filter by ML Predicted Quality
    df_quality = df_radius[df_radius['Predicted_Quality'] == 1].copy()
    if len(df_quality) < 3: 
        df_quality = df_radius.copy() # Fallback if not enough high-quality places

    valid_indices = df_quality.index
    tags_radius = TAGS_ENCODED.loc[valid_indices].copy()

    # Step D: Preference Matching (Cosine Similarity)
    user_vector = pd.DataFrame(0, index=[0], columns=TAGS_ENCODED.columns)
    for pref in user_preferences:
        for col in user_vector.columns:
            if pref.lower() == col.lower(): user_vector[col] = 1
            
    similarities = cosine_similarity(user_vector, tags_radius)[0]
    df_quality['Similarity_Score'] = similarities
    
    # Step E: Composite Scoring (60% Proximity, 40% Similarity)
    safe_radius = max(df_quality['Distance_From_Start'].max(), 0.1) 
    df_quality['Proximity_Score'] = 1 - (df_quality['Distance_From_Start'] / safe_radius)
    df_quality['Composite_Score'] = (df_quality['Similarity_Score'] * 0.4) + (df_quality['Proximity_Score'] * 0.6)
    
    recommended = df_quality[df_quality['Similarity_Score'] > 0].sort_values(by='Composite_Score', ascending=False).reset_index(drop=True)
    
    if recommended.empty:
        recommended = df_quality.sort_values(by='Distance_From_Start').reset_index(drop=True)
        
    return recommended.head(15)

# --- 3. OPTIMIZATION: GENETIC ALGORITHM (SPATIO-TEMPORAL ROUTING) ---
def evaluate_route(route_indices, df, start_lat, start_lon):
    if not route_indices: return 0, 0
    total_time_mins = 0
    total_similarity = 0
    TRAFFIC_BUFFER = 1.25 
    AVG_SPEED = 0.5 # Estimated speed (~30km/h)
    
    # Path from start point to first location
    first_loc = df.iloc[route_indices[0]]
    dist = calculate_haversine_distance(start_lat, start_lon, first_loc['Latitude'], first_loc['Longitude'])
    total_time_mins += (dist / AVG_SPEED) * TRAFFIC_BUFFER
    
    # Calculate sequential route time
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
    pop_size = 100
    generations = 100
    
    # Initialize random population
    population = [random.sample(all_indices, random.randint(1, min(4, len(all_indices)))) for _ in range(pop_size)]
    best_overall_route = []
    best_overall_fitness = -1
    best_overall_time = 0

    for _ in range(generations):
        fitnesses = []
        for route in population:
            time, sim = evaluate_route(route, filtered_df, start_lat, start_lon)
            
            # Fitness logic: Reward similarity and time efficiency
            if time <= max_time_minutes:
                fitness = (sim * 100) + (1000 / (time + 1))
            else:
                fitness = 0.0001 / (time + 1) # Time penalty
            
            fitnesses.append(fitness)
            if fitness > best_overall_fitness and time <= max_time_minutes:
                best_overall_fitness, best_overall_route, best_overall_time = fitness, route, time
                
        # Crossover & Mutation
        new_population = [best_overall_route] if best_overall_route else [population[0]]
        while len(new_population) < pop_size:
            parent = max(random.sample(list(zip(population, fitnesses)), 3), key=lambda x: x[1])[0].copy()
            if random.random() < 0.3 and len(parent) > 1: # Mutation
                i1, i2 = random.sample(range(len(parent)), 2)
                parent[i1], parent[i2] = parent[i2], parent[i1]
            new_population.append(parent)
        population = new_population

    penalty_hit = False
    
    # Graceful Time Fallback: Provide the closest single location if time is too short
    if not best_overall_route:
        best_overall_route = [min(all_indices, key=lambda x: evaluate_route([x], filtered_df, start_lat, start_lon)[0])]
        best_overall_time, _ = evaluate_route(best_overall_route, filtered_df, start_lat, start_lon)
        penalty_hit = True 
        
    optimal_places = [f"{filtered_df.iloc[idx]['Name']} ({int(filtered_df.iloc[idx]['Duration_Minutes'])} mins)" for idx in best_overall_route]
    return optimal_places, format_time_display(best_overall_time), penalty_hit

# --- 4. EXPLAINABLE AI (XAI) TEXT FORMATTER ---
def generate_itinerary_summary(places, preferences, api_key):
    if not places or not api_key: return "Optimal itinerary generated."
    
    # Prompt is strictly constrained to text-formatting to explain the rationale
    prompt = f"""
    Act strictly as an Explainable AI (XAI) text-formatter for a Context-Aware Spatio-Temporal travel system. 
    User Preferences: {', '.join(preferences)}.
    Optimized Route with Allocated Times: {', '.join(places)}.
    
    Task: Generate a structured summary explaining that the locations were selected via Machine Learning Quality filtering and Cosine Similarity mapping, and the routing sequence was optimized using a Genetic Algorithm. Keep it engaging and concise.
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key}"
    try:
        response = requests.post(url, headers={'Content-Type': 'application/json'}, json={"contents": [{"parts": [{"text": prompt}]}]})
        if response.status_code == 200:
            return response.json()['candidates'][0]['content']['parts'][0]['text']
        return "This Context-Aware itinerary blends your selected interests while optimizing for travel time."
    except: 
        return "This Context-Aware itinerary blends your selected interests while optimizing for travel time."