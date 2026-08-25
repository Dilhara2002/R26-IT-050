import os
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from flask_cors import CORS
# Load environment variables
load_dotenv()

# Import core AI logic from model.py
from model import (
    DATA_SCOPE,
    VERIFIED_STATUS,
    filter_locations,
    run_genetic_algorithm_details,
    generate_itinerary_summary,
)

app = Flask(__name__)
CORS(app) # Enables CORS for all routes so Web Browsers can connect

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
            
        # Step 1: Observed-rating screening and cosine-similarity matching
        filtered_places = filter_locations(user_preferences, user_lat, user_lon, radius_km)
        
        if filtered_places is None or filtered_places.empty:
            return jsonify({
                "status": "error",
                "code": "insufficient_verified_evidence",
                "error": (
                    "No source-traced Kandy locations matched the selected "
                    f"interests inside the active {radius_km} km radius."
                ),
                "data_scope": DATA_SCOPE,
                "search_radius_km": radius_km,
            }), 404
            
        # Step 2: Genetic Algorithm for Spatio-Temporal Routing
        optimization = run_genetic_algorithm_details(
            filtered_places,
            max_time_minutes,
            user_lat,
            user_lon,
            user_preferences=user_preferences,
        )
        optimal_places = optimization["optimized_route"]
        penalty_hit = optimization["time_limit_exceeded"]

        # Step 3: deterministic evidence is the core explanation. Gemini can
        # optionally paraphrase it, but never supplies the underlying evidence.
        core_summary = optimization["route_explanation"]["summary"]
        optional_paraphrase = core_summary
        if optimal_places:
            optional_paraphrase = generate_itinerary_summary(
                optimal_places,
                user_preferences,
                GEMINI_API_KEY,
                core_summary=core_summary,
            )
        
        msg = "Itinerary optimized successfully."
        if penalty_hit:
            msg = "Route calculated, but visiting all locations exceeds allocated time."
        
        return jsonify({
            "status": "success",
            "message": msg,
            "data": {
                "starting_location": {"lat": user_lat, "lon": user_lon},
                "data_scope": DATA_SCOPE,
                "verification_status": VERIFIED_STATUS,
                "verified_candidate_count": len(filtered_places),
                "search_radius_km": radius_km, 
                "user_preferences": user_preferences,
                "max_time_allocated_mins": max_time_minutes,
                "estimated_time_required": optimization["estimated_time_required"],
                "time_limit_exceeded": penalty_hit,
                "optimized_route": optimal_places,
                "optimized_stops": optimization["optimized_stops"],
                "planned_time_minutes": optimization["planned_time_minutes"],
                "visit_time_minutes": optimization["visit_time_minutes"],
                "travel_time_minutes": optimization["travel_time_minutes"],
                "remaining_time_minutes": optimization["remaining_time_minutes"],
                "time_utilization_percent": optimization["time_utilization_percent"],
                "travel_estimation": optimization["travel_estimation"],
                "route_explanation": optimization["route_explanation"],
                "ai_summary": core_summary,
                "ai_paraphrase": optional_paraphrase,
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("[SYSTEM] Starting Context-Aware AI Routing Server...")
    app.run(debug=True, host='0.0.0.0', port=5000)
