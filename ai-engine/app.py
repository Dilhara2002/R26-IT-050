from flask import Flask, request, jsonify
from model import filter_locations, run_genetic_algorithm

app = Flask(__name__)

@app.route('/api/optimize-itinerary', methods=['POST'])
def optimize_itinerary():
    try:
        data = request.get_json()
        
        user_preferences = data.get('preferences', [])
        max_time_minutes = data.get('max_time_minutes', 480)
        user_lat = data.get('current_lat', 7.2906) 
        user_lon = data.get('current_lon', 80.6337)
        
        # --- NEW LOGIC: Dynamic Radius based on Time ---
        # First, check if the user manually sent a radius
        radius_km = data.get('radius_km', None)
        
        # If the user didn't send a radius, calculate a smart default based on their time
        if radius_km is None:
            if max_time_minutes <= 360:      # Up to 6 hours
                radius_km = 15               # Keep them close (15km)
            elif max_time_minutes <= 720:    # Up to 12 hours
                radius_km = 30               # Let them explore a bit further (30km)
            elif max_time_minutes <= 1440:   # Up to 1 Day (24 hours)
                radius_km = 60               # Medium distance (60km)
            else:                            # More than 1 Day (e.g., 2 Days)
                radius_km = 100              # Give them a wide range (100km)
                
        # -----------------------------------------------
        
        if not user_preferences:
            return jsonify({"error": "Preferences are required."}), 400
            
        filtered_places = filter_locations(user_preferences, user_lat, user_lon, radius_km)
        
        if filtered_places is None or filtered_places.empty:
            return jsonify({"error": f"No matching locations found within {radius_km}km radius."}), 404
            
        optimal_places, estimated_time, penalty_hit = run_genetic_algorithm(
            filtered_places, max_time_minutes, user_lat, user_lon
        )
        
        msg = "Itinerary optimized successfully."
        if penalty_hit:
            msg = "Route calculated, but visiting all these places requires more time than allocated."
        
        return jsonify({
            "status": "success",
            "message": msg,
            "data": {
                "starting_location": {"lat": user_lat, "lon": user_lon},
                "search_radius_km": radius_km, # This will now show the dynamically calculated radius
                "user_preferences": user_preferences,
                "max_time_allocated_mins": max_time_minutes,
                "estimated_time_required": estimated_time,
                "time_limit_exceeded": penalty_hit,
                "optimized_route": optimal_places
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Starting AI Engine API Server on http://127.0.0.1:5000 ...")
    app.run(debug=True, port=5000)