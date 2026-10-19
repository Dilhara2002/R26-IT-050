"""Road schedules use mocked OSRM data; these tests are not field-trip evidence."""
import copy
from datetime import datetime
import math
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pandas as pd
import requests
import model
import road_routing as road


def options(**values):
    return road.validate_options({"routing_mode": "road", "departure_time": "2026-10-01T08:00:00+05:30",
                                  "break_minutes": 10, "travel_buffer_percent": 0, **values})


def frame():
    return pd.DataFrame([
        {"Place_ID": "a", "Name": "A", "Latitude": 7.291, "Longitude": 80.635, "Duration_Minutes": 20,
         "Tags": "Nature", "Composite_Score": .8},
        {"Place_ID": "b", "Name": "B", "Latitude": 7.30, "Longitude": 80.65, "Duration_Minutes": 20,
         "Tags": "Nature", "Composite_Score": .7},
    ])


def payload():
    # Directed: S-A-B-S = 10+5+20; S-B-A-S = 30+40+15.
    return {"code": "Ok", "durations": [[0, 600, 1800], [900, 0, 300], [1200, 2400, 0]],
            "distances": [[0, 10000, 30000], [15000, 0, 5000], [20000, 40000, 0]],
            "sources": [{"distance": 0}] * 3, "destinations": [{"distance": 0}] * 3}


def context(opts=None, data=None):
    with patch.object(road, "_request", return_value=data or payload()):
        return road.RoadContext(frame(), 7.29, 80.63, opts or options())


class RoadTests(unittest.TestCase):
    def test_legacy_unchanged_without_road_request(self):
        self.assertIsNone(road.validate_options({}))

    def test_invalid_options(self):
        for data in ({"routing_mode": "paid"}, {"break_minutes": True}, {"break_minutes": -1},
                     {"return_to_start": "yes"}, {"travel_buffer_percent": float("nan")},
                     {"departure_time": "2026-10-01T08:00:00"}, {"departure_time": "bad"}, {"visit_windows": []}):
            with self.subTest(data=data), self.assertRaises(road.RoadRoutingError):
                options(**data)

    def test_return_breaks_and_directed_legs(self):
        result = context().evaluate([0, 1])
        self.assertEqual(result["planned_time_minutes"], 85)
        self.assertEqual(result["travel_time_minutes"], 35)
        self.assertEqual(result["visit_time_minutes"], 40)
        self.assertEqual(result["return_travel_minutes"], 20)
        self.assertEqual(context().order([1, 0]), [0, 1])

    def test_return_toggle_and_buffer(self):
        result = context(options(return_to_start=False, travel_buffer_percent=20)).evaluate([0, 1])
        self.assertEqual(result["travel_time_minutes"], 18)
        self.assertEqual(result["planned_time_minutes"], 68)

    def test_window_wait_and_closing(self):
        windows = {"a": {"opens_at": "2026-10-01T09:00:00+05:30", "closes_at": "2026-10-01T10:00:00+05:30", "source_url": "https://example.test/hours"}}
        ctx = context(options(visit_windows=windows))
        self.assertEqual(ctx.evaluate([0])["waiting_time_minutes"], 40)
        self.assertEqual(ctx.evaluate([0])["planned_time_minutes"], 95)
        windows["a"]["closes_at"] = "2026-10-01T09:10:00+05:30"
        self.assertTrue(math.isinf(context(options(visit_windows=windows)).evaluate([0])["planned_time_minutes"]))

    def test_invalid_windows(self):
        for window in ({}, {"opens_at": "2026-10-02T08:00:00+05:30", "closes_at": "2026-10-02T18:00:00+05:30", "source_url": "https://example.test"}):
            with self.assertRaises(road.RoadRoutingError):
                options(visit_windows={"a": window})

    def test_unreachable_is_not_zero_or_haversine(self):
        data = payload()
        data["durations"][0][1] = None
        ctx = context(data=data)
        self.assertTrue(math.isinf(ctx.evaluate([0])["planned_time_minutes"]))
        self.assertEqual(ctx.order([0]), [])
        self.assertEqual(ctx.order([0, 1]), [1, 0])

    def test_bad_matrix_rejected(self):
        for value in (-1, float("nan"), True, "100"):
            data = payload(); data["durations"][0][1] = value
            with self.assertRaises(road.RoadRoutingError):
                context(data=data)
        data = payload(); data["distances"] = []
        with self.assertRaises(road.RoadRoutingError): context(data=data)

    def test_remote_start_rejected(self):
        data = payload(); data["sources"] = [{"distance": 1500}, {"distance": 0}, {"distance": 0}]
        with self.assertRaises(road.RoadRoutingError): context(data=data)

    def test_remote_candidate_does_not_block_usable_candidates(self):
        data = payload(); data["sources"] = [{"distance": 0}, {"distance": 1500}, {"distance": 0}]
        ctx = context(data=data)
        self.assertTrue(math.isinf(ctx.evaluate([0])["planned_time_minutes"]))
        self.assertEqual(ctx.order([0, 1], target=1, budget=100), [1])

    def test_budget_and_recent_sets(self):
        ctx = context()
        self.assertEqual(ctx.order([0, 1], budget=84), [])
        self.assertEqual(ctx.order([0, 1], target=1, forbidden=[["a"]], budget=100), [1])
        self.assertEqual(ctx.order([0, 1], target=1, required=["b"], budget=100), [1])
        self.assertEqual(ctx.order([0, 1], target=1, required=["missing"], budget=100), [])
        self.assertEqual(ctx.order([0, 1], target=2, forbidden=[["a", "b"]], budget=100), [])

    def test_existing_optimizer_uses_road_context(self):
        df = frame(); df.attrs["road_context"] = context()
        self.assertEqual(model.evaluate_route([0, 1], df, 7.29, 80.63)[0], 85)
        with patch.object(road, "_request", side_effect=road.RoadRoutingError("offline")):
            result = model.run_genetic_algorithm_details(df, 85, 7.29, 80.63, locked_place_ids=["a", "b"], minimum_route_stops=2)
        self.assertEqual(result["planned_time_minutes"], 85)
        self.assertEqual(result["road_geometry_status"], "unavailable")
        self.assertEqual(result["travel_estimation"]["method"], "osrm_road_network")
        self.assertFalse(result["travel_estimation"]["includes_opening_hours"])
        self.assertEqual(result["scheduled_finish_time"], "2026-10-01T09:25:00+05:30")
        self.assertNotIn("straight-line", result["route_explanation"]["summary"])
        self.assertAlmostEqual(result["planned_time_minutes"], sum(result[k] for k in ("visit_time_minutes", "travel_time_minutes", "break_time_minutes", "waiting_time_minutes")))

    def test_context_does_not_leak_between_requests(self):
        first = frame(); first.attrs["road_context"] = context()
        self.assertEqual(model.evaluate_route([0], first, 7.29, 80.63)[0], 55)
        self.assertLess(model.evaluate_route([0], frame(), 7.29, 80.63)[0], 30)

    def test_cache_and_failure(self):
        road._CACHE.clear()
        response = Mock(); response.json.return_value = payload()
        with patch.object(road.requests, "get", return_value=response) as get, patch.object(road.time, "sleep"):
            one = road._request("test", {})
            two = road._request("test", {})
            self.assertEqual(one["_retrieved_at"], two["_retrieved_at"])
            self.assertEqual(get.call_count, 1)
        road._CACHE.clear()
        with patch.object(road.requests, "get", side_effect=requests.Timeout), patch.object(road.time, "sleep"), self.assertRaises(road.RoadRoutingError):
            road._request("test", {})


class RoadEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import app
        cls.app_module = app
        cls.client = app.app.test_client()

    def request(self, **kwargs):
        return {**options(), "preferences": ["Nature"], "current_lat": 7.29, "current_lon": 80.63, "max_time_minutes": 100, **kwargs}

    def test_no_network_fallback_on_outage(self):
        with patch.object(self.app_module, "filter_locations", return_value=frame()), patch.object(road, "_request", side_effect=road.RoadRoutingError("offline")):
            response = self.client.post("/api/optimize-itinerary", json=self.request())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json["code"], "road_routing_unavailable")

    def test_road_request_serialization(self):
        with patch.object(self.app_module, "filter_locations", return_value=frame()), patch.object(self.app_module, "generate_itinerary_summary", return_value=None), patch.object(road, "_request", return_value=payload()):
            response = self.client.post("/api/optimize-itinerary", json=self.request())
        self.assertEqual(response.status_code, 200, response.json)
        data = response.json["data"]
        self.assertEqual(data["planning_options"]["routing_mode"], "road")
        self.assertIn("road_geometry_status", data)
        self.assertLessEqual(data["planned_time_minutes"], 100)

    def test_reschedule_preserves_places_and_rejects_closed_window(self):
        import model
        df = frame()
        verified = {row["Place_ID"]: {**row, "Verification_Status": model.VERIFIED_STATUS} for row in df.to_dict("records")}
        with patch.object(self.app_module, "_verified_places_by_id", return_value=verified), patch.object(self.app_module, "filter_locations", return_value=df), patch.object(self.app_module, "generate_itinerary_summary", return_value=None), patch.object(road, "_request", return_value=payload()):
            response = self.client.post("/api/optimize-itinerary", json=self.request(generation_mode="reschedule", locked_place_ids=["a", "b"]))
            self.assertEqual(response.status_code, 200, response.json)
            self.assertEqual({s["place_id"] for s in response.json["data"]["optimized_stops"]}, {"a", "b"})
            response = self.client.post("/api/optimize-itinerary", json=self.request(generation_mode="reschedule", locked_place_ids=["a", "b"], visit_windows={"a": {"opens_at": "2026-10-01T08:00:00+05:30", "closes_at": "2026-10-01T08:05:00+05:30", "source_url": "https://example.test/hours"}}))
            self.assertEqual(response.status_code, 409, response.json)


if __name__ == "__main__": unittest.main()
