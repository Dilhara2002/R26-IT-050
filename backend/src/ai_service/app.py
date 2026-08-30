import math
import os

from flask import Flask, jsonify, request
from dotenv import load_dotenv
from flask_cors import CORS

# Capture the process-level opt-in before dotenv can supply a fallback key.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
load_dotenv()

from model import (
    CATALOGUE_POI_COUNT,
    DATA_SCOPE,
    DATASET_VERSION,
    MAX_ROUTE_STOPS,
    PLACES_DF,
    SUPPORTED_DISTRICTS,
    VERIFIED_STATUS,
    calculate_haversine_distance,
    evaluate_route,
    filter_locations,
    find_best_full_regeneration_route,
    generate_itinerary_summary,
    get_relevance_engine_metadata,
    run_genetic_algorithm_details,
)

try:
    from landmark_routes import landmark_bp
except ModuleNotFoundError as error:
    landmark_bp = None
    print(
        "[WARNING] Landmark recognition is unavailable because an optional "
        f"dependency could not be loaded: {error.name}"
    )

app = Flask(__name__)
CORS(app)
if landmark_bp is not None:
    app.register_blueprint(landmark_bp)

ALLOWED_GENERATION_MODES = {"initial", "replace_stop", "full_regeneration"}
MAX_TIME_MINUTES = 1440
MAX_RECENT_PLAN_SIGNATURES = 8


class RequestValidationError(ValueError):
    def __init__(self, message, code="invalid_regeneration_constraints", status=400):
        super().__init__(message)
        self.code = code
        self.status = status


def _controlled_error(error, code, status, **metadata):
    return jsonify(
        {
            "status": "error",
            "code": code,
            "error": str(error),
            "data_scope": DATA_SCOPE,
            "dataset_version": DATASET_VERSION,
            "covered_districts": list(SUPPORTED_DISTRICTS),
            "catalogue_poi_count": CATALOGUE_POI_COUNT,
            **metadata,
        }
    ), status


def _finite_number(data, field_name, default, minimum, maximum):
    value = data[field_name] if field_name in data else default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RequestValidationError(f"{field_name} must be a finite number.")
    value = float(value)
    if not math.isfinite(value):
        raise RequestValidationError(f"{field_name} must be a finite number.")
    if value < minimum or value > maximum:
        raise RequestValidationError(
            f"{field_name} must be between {minimum} and {maximum}."
        )
    return int(value) if value.is_integer() else value


def _normalize_id(value, field_name):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise RequestValidationError(f"{field_name} must contain stable string IDs.")
    if isinstance(value, float) and not value.is_integer():
        raise RequestValidationError(f"{field_name} contains an invalid place ID.")
    normalized = str(int(value) if isinstance(value, float) else value).strip()
    if not normalized:
        raise RequestValidationError(f"{field_name} cannot contain blank IDs.")
    return normalized


def _normalize_id_array(data, field_name):
    raw_values = data[field_name] if field_name in data else []
    if not isinstance(raw_values, list):
        raise RequestValidationError(f"{field_name} must be an array when supplied.")
    normalized = [_normalize_id(value, field_name) for value in raw_values]
    if len(normalized) != len(set(normalized)):
        raise RequestValidationError(f"{field_name} cannot contain duplicate IDs.")
    return normalized


def _normalize_plan_signature(raw_value, field_name):
    if not isinstance(raw_value, list) or not 1 <= len(raw_value) <= MAX_ROUTE_STOPS:
        raise RequestValidationError(
            f"{field_name} must contain between 1 and {MAX_ROUTE_STOPS} place IDs."
        )
    normalized = [_normalize_id(value, field_name) for value in raw_value]
    if len(normalized) != len(set(normalized)):
        raise RequestValidationError(f"{field_name} cannot contain duplicate IDs.")
    return tuple(sorted(normalized))


def _normalize_recent_plan_signatures(data):
    raw_signatures = data.get("recent_plan_signatures", [])
    if not isinstance(raw_signatures, list) or len(raw_signatures) > MAX_RECENT_PLAN_SIGNATURES:
        raise RequestValidationError(
            f"recent_plan_signatures must contain at most {MAX_RECENT_PLAN_SIGNATURES} signatures."
        )
    signatures = [
        _normalize_plan_signature(value, f"recent_plan_signatures[{index}]")
        for index, value in enumerate(raw_signatures)
    ]
    if len(signatures) != len(set(signatures)):
        raise RequestValidationError(
            "recent_plan_signatures cannot contain duplicate signatures."
        )
    return signatures


def _verified_places_by_id():
    return {
        str(row["Place_ID"]): row
        for _, row in PLACES_DF.iterrows()
        if str(row.get("Verification_Status", "")) == VERIFIED_STATUS
    }


def _validate_constraints(data, user_lat, user_lon, radius_km, max_time_minutes):
    locked_ids = _normalize_id_array(data, "locked_place_ids")
    excluded_ids = _normalize_id_array(data, "excluded_place_ids")
    overlap = sorted(set(locked_ids) & set(excluded_ids))
    if overlap:
        raise RequestValidationError(
            f"A place cannot be both locked and excluded: {overlap}."
        )

    generation_mode = str(data.get("generation_mode", "initial")).strip()
    if generation_mode not in ALLOWED_GENERATION_MODES:
        raise RequestValidationError(
            f"generation_mode must be one of {sorted(ALLOWED_GENERATION_MODES)}."
        )

    current_signature = (
        _normalize_plan_signature(
            data["current_plan_signature"], "current_plan_signature"
        )
        if "current_plan_signature" in data
        else None
    )
    recent_signatures = _normalize_recent_plan_signatures(data)

    verified_by_id = _verified_places_by_id()
    contextual_ids = set(current_signature or ())
    for signature in recent_signatures:
        contextual_ids.update(signature)
    unknown_ids = sorted(
        (set(locked_ids) | set(excluded_ids) | contextual_ids) - set(verified_by_id)
    )
    if unknown_ids:
        raise RequestValidationError(
            f"Unknown, stale, or unverified place IDs: {unknown_ids}."
        )

    for place_id in locked_ids:
        place = verified_by_id[place_id]
        try:
            latitude = float(place["Latitude"])
            longitude = float(place["Longitude"])
            duration = float(place["Duration_Minutes"])
        except (TypeError, ValueError) as error:
            raise RequestValidationError(
                f"Locked place {place_id} has invalid coordinate or duration metadata."
            ) from error
        if not all(math.isfinite(value) for value in (latitude, longitude, duration)) or duration <= 0:
            raise RequestValidationError(
                f"Locked place {place_id} has invalid coordinate or duration metadata."
            )
        distance = calculate_haversine_distance(user_lat, user_lon, latitude, longitude)
        if distance > radius_km:
            raise RequestValidationError(
                f"Locked place {place_id} is outside the active {radius_km} km radius.",
                code="locked_place_outside_radius",
            )

    if locked_ids:
        locked_frame = PLACES_DF.set_index("Place_ID", drop=False).loc[
            locked_ids
        ].reset_index(drop=True)
        locked_time, _ = evaluate_route(
            list(range(len(locked_frame))), locked_frame, user_lat, user_lon
        )
        if locked_time > max_time_minutes:
            raise RequestValidationError(
                "The locked stops alone exceed the requested time budget under the "
                "existing visit and estimated-travel calculation.",
                code="locked_stops_exceed_budget",
                status=409,
            )

    replaced_place_id = data.get("replaced_place_id")
    target_stop_count = data.get("target_stop_count")
    if target_stop_count is not None and (
        isinstance(target_stop_count, bool)
        or not isinstance(target_stop_count, int)
        or target_stop_count < 1
        or target_stop_count > MAX_ROUTE_STOPS
    ):
        raise RequestValidationError(
            f"target_stop_count must be an integer from 1 to {MAX_ROUTE_STOPS}."
        )
    if generation_mode == "replace_stop":
        if replaced_place_id is None:
            raise RequestValidationError("replaced_place_id is required for replace_stop mode.")
        replaced_place_id = _normalize_id(replaced_place_id, "replaced_place_id")
        if replaced_place_id not in excluded_ids:
            raise RequestValidationError(
                "replaced_place_id must also be present in excluded_place_ids."
            )
        if target_stop_count is None:
            target_stop_count = len(locked_ids) + 1
        if target_stop_count != len(locked_ids) + 1:
            raise RequestValidationError(
                "replace_stop mode must lock every accepted stop and request exactly one replacement."
            )
        if current_signature is not None or recent_signatures:
            raise RequestValidationError(
                "Plan history fields are only valid in full_regeneration mode."
            )
    elif generation_mode == "initial":
        if replaced_place_id is not None:
            raise RequestValidationError(
                "replaced_place_id is only valid in replace_stop mode."
            )
        replaced_place_id = None
        target_stop_count = None
        if current_signature is not None or recent_signatures:
            raise RequestValidationError(
                "Plan history fields are only valid in full_regeneration mode."
            )
    else:
        if replaced_place_id is not None:
            raise RequestValidationError(
                "replaced_place_id is only valid in replace_stop mode."
            )
        replaced_place_id = None

    if generation_mode == "full_regeneration":
        if locked_ids:
            raise RequestValidationError(
                "full_regeneration cannot lock stops from the previous plan."
            )
        if current_signature is None:
            current_signature = tuple(sorted(excluded_ids)) if excluded_ids else None
        if current_signature is None:
            raise RequestValidationError(
                "full_regeneration requires a current plan signature."
            )
        if target_stop_count is None:
            target_stop_count = len(current_signature)
        if current_signature not in recent_signatures:
            if len(recent_signatures) >= MAX_RECENT_PLAN_SIGNATURES:
                recent_signatures = recent_signatures[1:]
            recent_signatures.append(current_signature)

    return {
        "generation_mode": generation_mode,
        "locked_place_ids": locked_ids,
        "excluded_place_ids": excluded_ids,
        "replaced_place_id": replaced_place_id,
        "target_stop_count": target_stop_count,
        "current_plan_signature": current_signature,
        "recent_plan_signatures": recent_signatures,
    }

@app.route("/api/optimize-itinerary", methods=["POST"])
def optimize_itinerary():
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            raise RequestValidationError("The request body must be a JSON object.")

        user_preferences = data.get("preferences", [])
        max_time_minutes = _finite_number(
            data, "max_time_minutes", 480, 1, MAX_TIME_MINUTES
        )
        user_lat = _finite_number(data, "current_lat", 7.2906, -90, 90)
        user_lon = _finite_number(data, "current_lon", 80.6337, -180, 180)
        radius_km = data.get("radius_km")

        if radius_km is None:
            if max_time_minutes <= 360:
                radius_km = 15
            elif max_time_minutes <= 720:
                radius_km = 30
            elif max_time_minutes <= 1440:
                radius_km = 60
            else:
                radius_km = 100
        else:
            radius_km = _finite_number(data, "radius_km", None, 0.1, 100)

        if not user_preferences:
            return jsonify({"error": "Preferences are required."}), 400
        constraints = _validate_constraints(
            data, user_lat, user_lon, radius_km, max_time_minutes
        )
        generation_mode = constraints["generation_mode"]
        locked_ids = constraints["locked_place_ids"]
        excluded_ids = constraints["excluded_place_ids"]

        candidate_excluded_ids = [] if generation_mode == "full_regeneration" else excluded_ids
        filtered_places = filter_locations(
            user_preferences,
            user_lat,
            user_lon,
            radius_km,
            excluded_place_ids=candidate_excluded_ids,
            locked_place_ids=locked_ids,
        )
        if filtered_places is None or filtered_places.empty:
            if generation_mode != "initial":
                return _controlled_error(
                    "The bounded verified dataset has no eligible alternatives for the requested regeneration constraints.",
                    "insufficient_verified_alternatives",
                    409,
                    generation_mode=generation_mode,
                    locked_place_ids=locked_ids,
                    excluded_place_ids=excluded_ids,
                    search_radius_km=radius_km,
                )
            return _controlled_error(
                "No source-traced Central Province locations matched the selected interests "
                f"inside the active {radius_km} km radius.",
                "insufficient_verified_evidence",
                404,
                search_radius_km=radius_km,
            )

        target_stop_count = constraints["target_stop_count"]
        selected_route_indices = None
        if generation_mode == "full_regeneration":
            selected_route_indices = find_best_full_regeneration_route(
                filtered_places,
                max_time_minutes,
                user_lat,
                user_lon,
                target_stop_count,
                constraints["recent_plan_signatures"],
            )
            if not selected_route_indices:
                return _controlled_error(
                    "No additional feasible useful itinerary remains in the bounded verified candidate set.",
                    "no_additional_feasible_alternative",
                    409,
                    generation_mode=generation_mode,
                    target_stop_count=target_stop_count,
                    current_plan_signature=list(constraints["current_plan_signature"]),
                    recent_plan_signatures=[
                        list(signature) for signature in constraints["recent_plan_signatures"]
                    ],
                    search_radius_km=radius_km,
                )
        optimization = run_genetic_algorithm_details(
            filtered_places,
            max_time_minutes,
            user_lat,
            user_lon,
            user_preferences=user_preferences,
            locked_place_ids=locked_ids,
            excluded_place_ids=excluded_ids,
            minimum_route_stops=target_stop_count or 1,
            maximum_route_stops=target_stop_count or MAX_ROUTE_STOPS,
            route_indices_override=selected_route_indices,
        )
        optimal_places = optimization["optimized_route"]
        optimized_stops = optimization["optimized_stops"]
        returned_ids = [str(stop["place_id"]) for stop in optimized_stops]

        constraints_satisfied = (
            set(locked_ids).issubset(returned_ids)
            and (
                generation_mode == "full_regeneration"
                or not (set(excluded_ids) & set(returned_ids))
            )
            and len(returned_ids) == len(set(returned_ids))
            and optimization["planned_time_minutes"] <= max_time_minutes
            and len(returned_ids) <= MAX_ROUTE_STOPS
        )
        if generation_mode in {"replace_stop", "full_regeneration"}:
            constraints_satisfied = constraints_satisfied and len(returned_ids) == target_stop_count
        if generation_mode == "full_regeneration":
            returned_signature = tuple(sorted(returned_ids))
            constraints_satisfied = (
                constraints_satisfied
                and returned_signature != constraints["current_plan_signature"]
                and returned_signature not in set(constraints["recent_plan_signatures"])
            )
        if not optimal_places or not constraints_satisfied:
            code = (
                "insufficient_verified_alternatives"
                if generation_mode != "initial"
                else "insufficient_feasible_route"
            )
            return _controlled_error(
                "No verified route can satisfy the requested stops, exclusions, active radius, "
                "and time budget without dropping a locked stop.",
                code,
                409,
                generation_mode=generation_mode,
                locked_place_ids=locked_ids,
                excluded_place_ids=excluded_ids,
                search_radius_km=radius_km,
            )

        core_summary = optimization["route_explanation"]["summary"]
        optional_paraphrase = generate_itinerary_summary(
            optimized_stops,
            user_preferences,
            GEMINI_API_KEY,
            core_summary=core_summary,
            itinerary_context={
                "visit_time_minutes": optimization["visit_time_minutes"],
                "travel_time_minutes": optimization["travel_time_minutes"],
                "planned_time_minutes": optimization["planned_time_minutes"],
                "remaining_time_minutes": optimization["remaining_time_minutes"],
                "time_utilization_percent": optimization["time_utilization_percent"],
                "route_limitations": (
                    "Straight-line Haversine travel estimate with an assumed average "
                    "speed and traffic buffer; no real-road routing, live traffic, "
                    "opening hours, return travel, parking, or walking."
                ),
            },
        )
        locked_set = set(locked_ids)
        alternative_count = sum(
            str(place_id) not in locked_set
            for place_id in filtered_places["Place_ID"]
        )
        optimal_places = optimization["optimized_route"]
        penalty_hit = optimization["time_limit_exceeded"]

        return jsonify(
            {
                "status": "success",
                "message": (
                    "Itinerary regenerated successfully."
                    if generation_mode != "initial"
                    else "Itinerary optimized successfully."
                ),
                "data": {
                    "starting_location": {"lat": user_lat, "lon": user_lon},
                    "data_scope": DATA_SCOPE,
                    "dataset_version": DATASET_VERSION,
                    "covered_districts": list(SUPPORTED_DISTRICTS),
                    "catalogue_poi_count": CATALOGUE_POI_COUNT,
                    "verification_status": VERIFIED_STATUS,
                    "profiling_mode": get_relevance_engine_metadata()["profiling_mode"],
                    "relevance_engine": get_relevance_engine_metadata(),
                    "verified_candidate_count": len(filtered_places),
                    "verified_alternative_count": alternative_count,
                    "search_radius_km": radius_km,
                    "user_preferences": user_preferences,
                    "max_time_allocated_mins": max_time_minutes,
                    "estimated_time_required": optimization["estimated_time_required"],
                    "time_limit_exceeded": False,
                    "optimized_route": optimal_places,
                    "optimized_stops": optimized_stops,
                    "planned_time_minutes": optimization["planned_time_minutes"],
                    "visit_time_minutes": optimization["visit_time_minutes"],
                    "travel_time_minutes": optimization["travel_time_minutes"],
                    "remaining_time_minutes": optimization["remaining_time_minutes"],
                    "time_utilization_percent": optimization["time_utilization_percent"],
                    "travel_estimation": optimization["travel_estimation"],
                    "route_explanation": optimization["route_explanation"],
                    "deterministic_explanation": optimization["route_explanation"],
                    "guide_explanation": optional_paraphrase,
                    "ai_summary": core_summary,
                    "ai_paraphrase": optional_paraphrase,
                    "generation_mode": generation_mode,
                    "locked_place_ids": locked_ids,
                    "excluded_place_ids": excluded_ids,
                    "replaced_place_id": constraints["replaced_place_id"],
                    "regeneration_target_stop_count": (
                        target_stop_count if generation_mode != "initial" else len(returned_ids)
                    ),
                    "current_plan_signature": (
                        list(constraints["current_plan_signature"])
                        if constraints["current_plan_signature"] is not None
                        else None
                    ),
                    "route_changed": generation_mode != "initial",
                },
            }
        ), 200
    except RequestValidationError as error:
        return _controlled_error(error, error.code, error.status)
    except Exception as error:
        return jsonify({"status": "error", "error": str(error)}), 500


if __name__ == "__main__":
    print("[SYSTEM] Starting Context-Aware AI Routing Server...")
    app.run(
        debug=os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"},
        host="0.0.0.0",
        port=int(os.getenv("AI_SERVICE_PORT", "5002")),
    )
