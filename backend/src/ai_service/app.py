import os
from flask import Flask, request, jsonify
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import core AI logic from model.py
from model import filter_locations, run_genetic_algorithm, generate_itinerary_summary

app = Flask(__name__)

# Retrieve Gemini API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

@app.route('/api/optimize-itinerary', methods=['POST'])
def optimize_itinerary():
    try:
        data = request.get_json()
        
        user_preferences = data.get('preferences', [])
        max_time_minutes = data.get('max_time_minutes', 480)
        user_lat = data.get('current_lat', 7.2906) 
        user_lon = data.get('current_lon', 80.6337)
        radius_km = data.get('radius_km', None)
        
        # Dynamic Radius Constraints based on Time Allocation
        if radius_km is None:
            if max_time_minutes <= 360:      
                radius_km = 15               
            elif max_time_minutes <= 720:    
                radius_km = 30               
            elif max_time_minutes <= 1440:   
                radius_km = 60               
            else:                            
                radius_km = 100              
                
        if not user_preferences:
            return jsonify({"error": "Preferences are required."}), 400
            
        # Step 1: ML Quality Filter & KNN Content Matching
        filtered_places = filter_locations(user_preferences, user_lat, user_lon, radius_km)
        
        if filtered_places is None or filtered_places.empty:
            return jsonify({"error": f"No matching locations found within {radius_km}km radius."}), 404
            
        # Step 2: Genetic Algorithm for Spatio-Temporal Routing
        optimal_places, estimated_time, penalty_hit = run_genetic_algorithm(
            filtered_places, max_time_minutes, user_lat, user_lon
        )

        # Step 3: XAI Formatting via Gemini API
        xai_summary = ""
        if optimal_places:
            print("[INFO] Generating XAI Summary via Gemini API...")
            xai_summary = generate_itinerary_summary(optimal_places, user_preferences, GEMINI_API_KEY)
        
        msg = "Itinerary optimized successfully."
        if penalty_hit:
            msg = "Route calculated, but visiting all locations exceeds allocated time."
        
        return jsonify({
            "status": "success",
            "message": msg,
            "data": {
                "starting_location": {"lat": user_lat, "lon": user_lon},
                "search_radius_km": radius_km, 
                "user_preferences": user_preferences,
                "max_time_allocated_mins": max_time_minutes,
                "estimated_time_required": estimated_time,
                "time_limit_exceeded": penalty_hit,
                "optimized_route": optimal_places,
                "ai_summary": xai_summary 
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("[SYSTEM] Starting Context-Aware AI Routing Server...")
    app.run(debug=True, port=5000)