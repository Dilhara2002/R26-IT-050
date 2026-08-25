import sys
from pathlib import Path
import unittest

import pandas as pd


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import app as flask_app
import model


def synthetic_verified_places():
    count = 6
    return pd.DataFrame(
        {
            "Place_ID": [f"verified-{index}" for index in range(count)],
            "Legacy_Place_ID": [str(9100 + index) for index in range(count)],
            "Name": [f"Verified Place {index}" for index in range(count)],
            "Latitude": [7.2906 + index * 0.008 for index in range(count)],
            "Longitude": [80.6337 for _ in range(count)],
            "District": ["Kandy" for _ in range(count)],
            "Tags": ["Nature|Adventure" for _ in range(count)],
            "Duration_Minutes": [20 for _ in range(count)],
            "Duration_Basis": ["synthetic_test_estimate" for _ in range(count)],
            "Rating": [float("nan") for _ in range(count)],
            "Source_Name": ["Synthetic Test Source" for _ in range(count)],
            "Source_URL": [f"https://example.test/{index}" for index in range(count)],
            "Source_License": ["Test-only" for _ in range(count)],
            "Verification_Status": [model.VERIFIED_STATUS for _ in range(count)],
            "Verification_Note": ["Explicitly synthetic test fixture" for _ in range(count)],
        }
    )


class RegenerationApiTests(unittest.TestCase):
    def setUp(self):
        self.original_model_places = model.PLACES_DF
        self.original_model_tags = model.TAGS_ENCODED
        self.original_app_places = flask_app.PLACES_DF
        self.original_gemini_key = flask_app.GEMINI_API_KEY
        places = synthetic_verified_places()
        model.PLACES_DF = places.copy()
        model.TAGS_ENCODED = places["Tags"].str.get_dummies(sep="|")
        flask_app.PLACES_DF = model.PLACES_DF
        flask_app.GEMINI_API_KEY = None
        self.client = flask_app.app.test_client()
        self.basic_request = {
            "preferences": ["Nature", "Adventure"],
            "max_time_minutes": 100,
            "current_lat": 7.2906,
            "current_lon": 80.6337,
            "radius_km": 15,
        }

    def tearDown(self):
        model.PLACES_DF = self.original_model_places
        model.TAGS_ENCODED = self.original_model_tags
        flask_app.PLACES_DF = self.original_app_places
        flask_app.GEMINI_API_KEY = self.original_gemini_key

    def post(self, additions=None):
        return self.client.post(
            "/api/optimize-itinerary",
            json={**self.basic_request, **(additions or {})},
        )

    def initial_result(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()["data"]

    def test_legacy_request_remains_compatible_and_additive_metadata_is_present(self):
        data = self.initial_result()
        self.assertEqual(data["generation_mode"], "initial")
        self.assertEqual(data["locked_place_ids"], [])
        self.assertEqual(data["excluded_place_ids"], [])
        self.assertFalse(data["route_changed"])
        self.assertTrue(data["optimized_route"])
        self.assertTrue(data["optimized_stops"])

    def test_non_arrays_duplicates_and_overlaps_are_controlled_validation_errors(self):
        cases = (
            {"locked_place_ids": "verified-0"},
            {"locked_place_ids": None},
            {"excluded_place_ids": ["verified-0", "verified-0"]},
            {
                "locked_place_ids": ["verified-0"],
                "excluded_place_ids": ["verified-0"],
            },
        )
        for additions in cases:
            with self.subTest(additions=additions):
                response = self.post(additions)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(
                    response.get_json()["code"], "invalid_regeneration_constraints"
                )

    def test_unknown_unverified_and_quarantined_ids_are_rejected(self):
        for place_id in ("unknown-id", "79"):
            with self.subTest(place_id=place_id):
                response = self.post({"locked_place_ids": [place_id]})
                self.assertEqual(response.status_code, 400)
                self.assertIn("Unknown, stale, or unverified", response.get_json()["error"])

    def test_locked_stop_outside_active_radius_is_rejected(self):
        response = self.post(
            {"locked_place_ids": ["verified-5"], "radius_km": 1}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["code"], "locked_place_outside_radius")

    def test_locked_stops_exceeding_budget_are_rejected(self):
        response = self.post(
            {"locked_place_ids": ["verified-0"], "max_time_minutes": 10}
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["code"], "locked_stops_exceed_budget")

    def test_locked_stop_with_invalid_duration_metadata_is_rejected(self):
        model.PLACES_DF.loc[
            model.PLACES_DF["Place_ID"] == "verified-0", "Duration_Minutes"
        ] = float("nan")
        response = self.post({"locked_place_ids": ["verified-0"]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid coordinate or duration metadata", response.get_json()["error"])

    def test_replacement_preserves_accepted_stops_and_excludes_rejected_stop(self):
        original = self.initial_result()
        original_ids = [str(stop["place_id"]) for stop in original["optimized_stops"]]
        rejected_id = original_ids[0]
        locked_ids = original_ids[1:]
        response = self.post(
            {
                "generation_mode": "replace_stop",
                "excluded_place_ids": [rejected_id],
                "locked_place_ids": locked_ids,
                "replaced_place_id": rejected_id,
                "target_stop_count": len(original_ids),
            }
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        data = response.get_json()["data"]
        returned_ids = [str(stop["place_id"]) for stop in data["optimized_stops"]]
        self.assertTrue(set(locked_ids).issubset(returned_ids))
        self.assertEqual(
            [place_id for place_id in returned_ids if place_id in set(locked_ids)],
            locked_ids,
        )
        self.assertNotIn(rejected_id, returned_ids)
        self.assertEqual(len(returned_ids), len(original_ids))
        self.assertTrue(data["route_changed"])
        self.assertEqual(data["replaced_place_id"], rejected_id)

    def test_replacement_without_any_non_locked_alternative_is_controlled(self):
        original = self.initial_result()
        original_ids = [str(stop["place_id"]) for stop in original["optimized_stops"]]
        rejected_id = original_ids[0]
        locked_ids = original_ids[1:]
        non_locked_ids = [
            f"verified-{index}"
            for index in range(6)
            if f"verified-{index}" not in locked_ids
        ]
        response = self.post(
            {
                "generation_mode": "replace_stop",
                "excluded_place_ids": non_locked_ids,
                "locked_place_ids": locked_ids,
                "replaced_place_id": rejected_id,
                "target_stop_count": len(original_ids),
            }
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.get_json()["code"], "insufficient_verified_alternatives"
        )

    def test_full_regeneration_returns_a_different_verified_place_set(self):
        original = self.initial_result()
        original_ids = {
            str(stop["place_id"]) for stop in original["optimized_stops"]
        }
        response = self.post(
            {
                "generation_mode": "full_regeneration",
                "excluded_place_ids": sorted(original_ids),
                "locked_place_ids": [],
            }
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        data = response.get_json()["data"]
        returned_ids = {
            str(stop["place_id"]) for stop in data["optimized_stops"]
        }
        self.assertTrue(returned_ids)
        self.assertNotEqual(returned_ids, original_ids)
        self.assertTrue(returned_ids.isdisjoint(original_ids))
        self.assertTrue(data["route_changed"])

    def test_insufficient_full_regeneration_alternatives_is_truthful(self):
        response = self.post(
            {
                "generation_mode": "full_regeneration",
                "excluded_place_ids": [f"verified-{index}" for index in range(6)],
                "locked_place_ids": [],
            }
        )
        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertEqual(payload["code"], "insufficient_verified_alternatives")
        self.assertEqual(payload["generation_mode"], "full_regeneration")

    def test_success_updates_structured_map_xai_and_time_contracts(self):
        data = self.initial_result()
        self.assertLessEqual(data["planned_time_minutes"], 100)
        self.assertLessEqual(len(data["optimized_stops"]), 8)
        self.assertEqual(
            len({str(stop["place_id"]) for stop in data["optimized_stops"]}),
            len(data["optimized_stops"]),
        )
        self.assertTrue(
            all(
                isinstance(stop["latitude"], float)
                and isinstance(stop["longitude"], float)
                and stop["explanation"]
                and stop["verification_status"] == model.VERIFIED_STATUS
                for stop in data["optimized_stops"]
            )
        )
        self.assertEqual(
            data["planned_time_minutes"],
            data["visit_time_minutes"] + data["travel_time_minutes"],
        )
        self.assertTrue(data["route_explanation"]["summary"])

    def test_fixed_seed_with_locked_and_excluded_constraints_is_deterministic(self):
        filtered = model.filter_locations(
            ["Nature"],
            7.2906,
            80.6337,
            15,
            excluded_place_ids=["verified-0"],
            locked_place_ids=["verified-1"],
        )
        arguments = dict(
            max_time_minutes=100,
            start_lat=7.2906,
            start_lon=80.6337,
            random_seed=77,
            user_preferences=["Nature"],
            locked_place_ids=["verified-1"],
            excluded_place_ids=["verified-0"],
            minimum_route_stops=3,
            maximum_route_stops=3,
        )
        first = model.run_genetic_algorithm_details(filtered, **arguments)
        second = model.run_genetic_algorithm_details(filtered, **arguments)
        self.assertEqual(first, second)
        returned = {str(stop["place_id"]) for stop in first["optimized_stops"]}
        self.assertIn("verified-1", returned)
        self.assertNotIn("verified-0", returned)


if __name__ == "__main__":
    unittest.main()
