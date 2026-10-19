"""No-key OSRM driving estimates and request-local day scheduling.

Public demo use only: bounded cache, <= 1 request/second per process, no retries.
No live traffic, weather, safety or opening-hours claims are inferred from OSM.
"""
from collections import OrderedDict
from datetime import datetime, timedelta
import math
import os
import threading
import time
from urllib.parse import urlencode

import requests


class RoadRoutingError(ValueError):
    def __init__(self, message, code="road_routing_unavailable", status=503):
        super().__init__(message)
        self.code, self.status = code, status


_CACHE = OrderedDict()
_LOCK = threading.Lock()
_LAST_REQUEST = 0.0
_CACHE_TTL = 3600


def _request(path, params):
    global _LAST_REQUEST
    base = os.getenv("ITINERARY_OSRM_URL", "https://routing.openstreetmap.de/routed-car").rstrip("/")
    key = (base, path, urlencode(sorted(params.items())))
    with _LOCK:
        now = time.monotonic()
        if key in _CACHE and now - _CACHE[key][0] < _CACHE_TTL:
            _CACHE.move_to_end(key)
            return _CACHE[key][1]
        delay = 1.05 - (now - _LAST_REQUEST)
        if delay > 0:
            time.sleep(delay)
        _LAST_REQUEST = time.monotonic()
        try:
            response = requests.get(
                f"{base}/{path}", params=params, timeout=(3, 12),
                headers={"User-Agent": "R26-IT-050-ItineraryResearch/1.0"},
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("code") != "Ok":
                raise ValueError("OSRM did not find a road route")
        except (requests.RequestException, ValueError) as error:
            raise RoadRoutingError(
                "The free road-routing service is unavailable or could not route these points. "
                "Try again later or adjust the starting point. No paid API or straight-line fallback was used."
            ) from error
        payload["_retrieved_at"] = datetime.now().astimezone().isoformat()
        _CACHE[key] = (time.monotonic(), payload)
        while len(_CACHE) > 32:
            _CACHE.popitem(last=False)
        return payload


def _number(data, name, default, low, high):
    value = data.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise RoadRoutingError(f"{name} must be a number between {low} and {high}.", "invalid_day_plan", 400)
    return float(value)


def validate_options(data):
    mode = data.get("routing_mode", "legacy")
    if mode not in ("legacy", "road"):
        raise RoadRoutingError("routing_mode must be road or legacy.", "invalid_day_plan", 400)
    if mode == "legacy":
        return None
    departure = data.get("departure_time")
    try:
        start = datetime.fromisoformat(departure) if isinstance(departure, str) else None
        if start is None or start.utcoffset() != timedelta(hours=5, minutes=30):
            raise ValueError()
    except ValueError as error:
        raise RoadRoutingError("departure_time must be an ISO date/time with Sri Lanka's +05:30 offset.", "invalid_day_plan", 400) from error
    return_to_start = data.get("return_to_start", True)
    if not isinstance(return_to_start, bool):
        raise RoadRoutingError("return_to_start must be true or false.", "invalid_day_plan", 400)
    windows = data.get("visit_windows", {})
    if not isinstance(windows, dict) or len(windows) > 40:
        raise RoadRoutingError("visit_windows must be an object with at most 40 place IDs.", "invalid_day_plan", 400)
    normalized = {}
    for place_id, window in windows.items():
        try:
            if not isinstance(window, dict):
                raise ValueError()
            opens = datetime.fromisoformat(window["opens_at"])
            closes = datetime.fromisoformat(window["closes_at"])
            source = window["source_url"]
            if (opens.utcoffset() != start.utcoffset() or closes.utcoffset() != start.utcoffset()
                    or opens >= closes or opens.date() != start.date() or closes.date() != start.date()
                    or not isinstance(source, str) or not source.startswith(("https://", "http://")) or len(source) > 1000):
                raise ValueError()
        except (ValueError, KeyError, TypeError) as error:
            raise RoadRoutingError("Each visit window needs same-trip-date opens_at/closes_at (+05:30) and a source_url.", "invalid_day_plan", 400) from error
        normalized[str(place_id)] = {"opens_at": opens.isoformat(), "closes_at": closes.isoformat(), "source_url": source}
    return {
        "routing_mode": "road", "departure_time": start.isoformat(),
        "return_to_start": return_to_start,
        "break_minutes": _number(data, "break_minutes", 30, 0, 180),
        "travel_buffer_percent": _number(data, "travel_buffer_percent", 25, 0, 100),
        "visit_windows": normalized,
    }


def _matrix(payload, name, size, divisor):
    matrix = payload.get(name)
    if not isinstance(matrix, list) or len(matrix) != size:
        raise RoadRoutingError("Road-routing service returned an invalid matrix.")
    result = []
    for row in matrix:
        if not isinstance(row, list) or len(row) != size:
            raise RoadRoutingError("Road-routing service returned an invalid matrix.")
        values = []
        for value in row:
            if value is None:
                values.append(math.inf)  # Unreachable is never a zero-minute leg.
            elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise RoadRoutingError("Road-routing service returned invalid travel data.")
            else:
                values.append(value / divisor)
        result.append(values)
    return result


class RoadContext:
    def __init__(self, df, latitude, longitude, options):
        self.options = options
        self.start = datetime.fromisoformat(options["departure_time"])
        self.records = df.to_dict("records")
        self.coordinates = [(float(longitude), float(latitude))] + [
            (float(row["Longitude"]), float(row["Latitude"])) for row in self.records
        ]
        encoded = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in self.coordinates)
        payload = _request(f"table/v1/driving/{encoded}", {"annotations": "duration,distance"})
        size = len(self.coordinates)
        self.minutes = _matrix(payload, "durations", size, 60)
        self.distances = _matrix(payload, "distances", size, 1000)
        # A remote candidate must not invalidate other usable places. Exclude its
        # incoming/outgoing matrix edges; only an unusable start rejects the request.
        unavailable = set()
        self.snap_distances = [0.0] * size
        for name in ("sources", "destinations"):
            points = payload.get(name)
            if not isinstance(points, list) or len(points) != size:
                raise RoadRoutingError("Road-routing service omitted road-access evidence.")
            for index, point in enumerate(points):
                if point is None:
                    unavailable.add(index)
                    continue
                distance = point.get("distance") if isinstance(point, dict) else None
                if isinstance(distance, bool) or not isinstance(distance, (int, float)) or not math.isfinite(distance) or distance < 0:
                    raise RoadRoutingError("Road-routing service returned invalid road-access evidence.")
                self.snap_distances[index] = max(self.snap_distances[index], distance)
                if distance > 1000:
                    unavailable.add(index)
        if 0 in unavailable:
            raise RoadRoutingError("The starting point is not within 1 km of a routable road. Choose a road-accessible starting point.", "road_access_uncertain", 409)
        for index in unavailable:
            for other in range(size):
                self.minutes[index][other] = self.minutes[other][index] = math.inf
                self.distances[index][other] = self.distances[other][index] = math.inf
        self.fetched_at = payload.get("_retrieved_at", datetime.now().astimezone().isoformat())
        self.factor = 1 + options["travel_buffer_percent"] / 100
        self.windows = {}
        for index, row in enumerate(self.records):
            window = options["visit_windows"].get(str(row["Place_ID"]))
            if window:
                self.windows[index] = tuple((datetime.fromisoformat(window[key]) - self.start).total_seconds() / 60 for key in ("opens_at", "closes_at"))

    def leg(self, previous, index):
        source, destination = previous + 1, index + 1  # -1 is the start/return point.
        minutes, distance = self.minutes[source][destination], self.distances[source][destination]
        return (minutes * self.factor if math.isfinite(distance) else math.inf), distance

    def advance(self, elapsed, previous, index, first=False):
        travel, _ = self.leg(previous, index)
        arrival = elapsed + travel
        # A single explicit break is scheduled after the first arrival, before visiting.
        ready = arrival + (self.options["break_minutes"] if first else 0)
        opens, closes = self.windows.get(index, (-math.inf, math.inf))
        visit_start = max(ready, opens)
        end = visit_start + float(self.records[index]["Duration_Minutes"])
        return (end if end <= closes else math.inf), arrival, visit_start, max(0, opens - ready)

    def evaluate(self, route):
        elapsed = travel = visit = waiting = relevance = 0.0
        previous = -1
        timeline = []
        for index in route:
            leg, distance = self.leg(previous, index)
            end, arrival, visit_start, wait = self.advance(elapsed, previous, index, previous == -1)
            row = self.records[index]
            timeline.append({"arrival_minutes": arrival, "visit_start_minutes": visit_start,
                             "departure_minutes": end, "waiting_minutes": wait,
                             "leg_distance_km": distance, "estimated_leg_travel_minutes": leg})
            elapsed = end
            travel += leg
            visit += float(row["Duration_Minutes"])
            waiting += wait
            relevance += float(row.get("Composite_Score", row.get("Similarity_Score", 1)))
            previous = index
        return_time = return_distance = 0.0
        if route and self.options["return_to_start"]:
            return_time, return_distance = self.leg(previous, -1)
            travel += return_time
            elapsed += return_time
        return {"planned_time_minutes": elapsed, "visit_time_minutes": visit,
                "travel_time_minutes": travel, "relevance": relevance,
                "waiting_time_minutes": waiting, "timeline": timeline,
                "return_travel_minutes": return_time, "return_distance_km": return_distance,
                "break_time_minutes": self.options["break_minutes"] if route else 0}

    def order(self, indices, target=None, forbidden=(), budget=math.inf, fitness=None, required=()):
        """Earliest-departure subset DP; static directed travel, one supplied window/POI.

        For fixed stops, minimize finish time. For regeneration, score feasible unseen
        fixed-size sets with the existing model's relevance/travel fitness function.
        """
        indices = list(dict.fromkeys(indices))
        target = len(indices) if target is None else target
        if not indices or target > len(indices):
            return []
        bits = {index: 1 << position for position, index in enumerate(indices)}
        states = {}
        for index in indices:
            elapsed = self.advance(0, -1, index, True)[0]
            if math.isfinite(elapsed) and elapsed <= budget:
                states[(bits[index], index)] = (elapsed, (index,))
        for size in range(2, target + 1):
            next_states = {}
            for (mask, last), (elapsed, path) in states.items():
                for index in indices:
                    if mask & bits[index]:
                        continue
                    end = self.advance(elapsed, last, index)[0]
                    if not math.isfinite(end) or end > budget:
                        continue
                    key = (mask | bits[index], index)
                    candidate = (end, path + (index,))
                    if key not in next_states or candidate < next_states[key]:
                        next_states[key] = candidate
            states = next_states
        excluded = {tuple(sorted(map(str, signature))) for signature in forbidden}
        required = set(map(str, required))
        best = None
        for elapsed, path in states.values():
            signature = tuple(sorted(str(self.records[i]["Place_ID"]) for i in path))
            if signature in excluded or not required.issubset(signature):
                continue
            finish = elapsed + (self.leg(path[-1], -1)[0] if self.options["return_to_start"] else 0)
            if not math.isfinite(finish) or finish > budget:
                continue
            score = -fitness(list(path)) if fitness else 0
            candidate = (score, finish, signature, path)
            if best is None or candidate < best:
                best = candidate
        return list(best[-1]) if best else []

    def decorate(self, result, route, max_time):
        details = self.evaluate(route)
        def timestamp(minutes):
            return (self.start + timedelta(minutes=minutes)).isoformat(timespec="seconds")
        for stop, index, timing in zip(result["optimized_stops"], route, details["timeline"]):
            stop.update({key: value for key, value in timing.items() if key in ("leg_distance_km", "estimated_leg_travel_minutes", "waiting_minutes")})
            stop["road_access_distance_metres"] = round(self.snap_distances[index + 1], 1)
            stop.update({"arrival_time": timestamp(timing["arrival_minutes"]),
                         "visit_start_time": timestamp(timing["visit_start_minutes"]),
                         "departure_time": timestamp(timing["departure_minutes"]),
                         "opening_hours_status": "user_supplied_window" if index in self.windows else "unknown_check_before_travel"})
            stop["explanation"] = (
                f"Incoming road leg: {stop['leg_distance_km']:.2f} km; "
                f"{stop['estimated_leg_travel_minutes']:.1f} minutes including the declared planning buffer. "
                f"Visit: {stop['duration_minutes']} minutes ({stop['duration_basis']}). "
                f"Opening hours: {stop['opening_hours_status']}. "
                f"Matched interests: {', '.join(stop['matched_preferences']) or 'none'}."
            )
        # Round display components only; feasibility was checked with unrounded values.
        for key in ("visit_time_minutes", "travel_time_minutes", "waiting_time_minutes", "break_time_minutes"):
            result[key] = round(details[key], 2)
        total = sum(result[key] for key in ("visit_time_minutes", "travel_time_minutes", "waiting_time_minutes", "break_time_minutes"))
        result.update({"planned_time_minutes": round(total, 2), "remaining_time_minutes": round(max_time - total, 2),
                       "estimated_time_required": f"{math.ceil(total) // 60}h {math.ceil(total) % 60}m",
                       "time_utilization_percent": round(total / max_time * 100, 1), "planning_options": self.options,
                       "scheduled_finish_time": timestamp(details["planned_time_minutes"]),
                       "return_travel_minutes": round(details["return_travel_minutes"], 2)})
        limitations = ("Static driving estimates, not live traffic or future-road predictions. "
                       "The travel buffer is an assumption, not a calibrated confidence interval. "
                       "Visit durations are research estimates. Unprovided opening hours, weather, closures, "
                       "parking, walking, accessibility and monetary costs are unverified.")
        result["travel_estimation"] = {
            "method": "osrm_road_network", "provider": "OSRM", "profile": "driving",
            "retrieved_at": self.fetched_at, "cache_ttl_seconds": _CACHE_TTL,
            "travel_buffer_percent": self.options["travel_buffer_percent"],
            "includes_return_to_start": self.options["return_to_start"], "includes_live_traffic": False,
            "includes_opening_hours": bool(route) and all(index in self.windows for index in route),
            "includes_parking_or_walking": False, "limitations": limitations,
            "start_road_access_distance_metres": round(self.snap_distances[0], 1),
            "attribution": "Routing: OSRM / FOSSGIS; map data © OpenStreetMap contributors (ODbL)",
        }
        result["validation_status"] = "estimated_feasible_needs_field_validation"
        summary = (f"Selected {len(route)} stop(s) using the existing relevance-based planner and road travel estimates. "
                   f"Planned {total:.2f} minutes: {result['travel_time_minutes']} travel, {result['visit_time_minutes']} visits, "
                   f"{result['break_time_minutes']} break and {result['waiting_time_minutes']} waiting. "
                   f"Return to start: {'included' if self.options['return_to_start'] else 'not requested'}. {limitations}")
        result["route_explanation"].update({"summary": summary,
            "selection_stages": ["existing_relevance_gate_and_candidate_ranking", "bounded_stop_set_selection_with_road_time_constraints", "directed_road_time_ordering_and_supplied_visit_windows"],
            "planned_time_minutes": result["planned_time_minutes"], "visit_time_minutes": result["visit_time_minutes"],
            "estimated_travel_time_minutes": result["travel_time_minutes"], "time_utilization_percent": result["time_utilization_percent"]})
        result["road_geometry"] = None
        result["road_geometry_status"] = "unavailable"
        if route:
            points = [self.coordinates[0]] + [self.coordinates[i + 1] for i in route]
            if self.options["return_to_start"]:
                points.append(self.coordinates[0])
            try:
                encoded = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in points)
                payload = _request(f"route/v1/driving/{encoded}", {"overview": "simplified", "geometries": "geojson", "steps": "false", "continue_straight": "false"})
                geometry = payload["routes"][0]["geometry"]
                points = geometry.get("coordinates", [])
                if (geometry.get("type") == "LineString" and isinstance(points, list) and 2 <= len(points) <= 50000
                    and all(isinstance(point, list) and len(point) == 2
                            and all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) for value in point)
                            and -180 <= point[0] <= 180 and -90 <= point[1] <= 90 for point in points)):
                    result["road_geometry"] = geometry
                    result["road_geometry_status"] = "available"
            except (RoadRoutingError, KeyError, IndexError, TypeError, AttributeError):
                pass  # The matrix still supports the schedule; don't label a straight line as a road.
        return result
