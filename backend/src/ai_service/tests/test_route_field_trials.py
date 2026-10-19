import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'scripts' / 'evaluate_route_field_trials.py'
spec = importlib.util.spec_from_file_location('field_trials', path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


def packet(actual=None):
    return {'schema_version': 1, 'planning_options': {'departure_time': '2026-10-01T08:00:00+05:30'},
            'plan': {'budget_minutes': 100}, 'legs': [{'predicted_minutes': 20, 'google_minutes': 25,
            'actual_minutes': actual, 'evidence_notes': 'manual log and Maps screenshot'}], 'trip': {}}


class FieldTrialTests(unittest.TestCase):
    def test_missing_is_not_perfect_accuracy(self):
        report = module.summarize([packet()])
        self.assertIsNone(report['model_mae_minutes'])
        self.assertIsNone(report['on_time_completion_rate'])
        self.assertEqual(report['status'], 'no_field_observations')

    def test_errors_recomputed_not_trusted(self):
        trial = packet(30); trial['metrics'] = {'model_mae_minutes': 0}
        trial['trip'] = {'actual_total_minutes': 120, 'all_stops_completed': True}
        report = module.summarize([trial])
        self.assertEqual(report['model_mae_minutes'], 10)
        self.assertEqual(report['paired_google_mae_minutes'], 5)
        self.assertEqual(report['on_time_completion_rate'], 0)

    def test_duplicates_and_bad_numbers_rejected(self):
        with self.assertRaises(ValueError): module.summarize([packet(), packet()])
        with self.assertRaises(ValueError): module.summarize([packet(-1)])
