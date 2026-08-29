from pathlib import Path
import sys
import unittest
from unittest import mock


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = AI_SERVICE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import show_relevance_panel_evidence as panel


class RelevancePanelEvidenceTest(unittest.TestCase):
    def test_report_contains_bounded_active_and_rejected_evidence(self):
        report = panel.render_report()
        self.assertIn("Model: Linear SVM", report)
        self.assertIn("41/60 = 68.3333%", report)
        self.assertIn("Macro-F1: 0.519649", report)
        self.assertIn("[33, 1, 0], [3, 6, 1], [6, 8, 2]", report)
        self.assertIn("WEAK-SUPERVISION GROUPED CV (NOT HUMAN ACCURACY)", report)
        self.assertIn("REJECTED V2 CANDIDATE", report)
        self.assertIn("V2 activation gate: FAIL", report)
        self.assertNotIn("v2 candidate — active", report.lower())

    def test_report_is_read_only_and_never_opens_a_workbook(self):
        original_open = Path.open
        opened = []

        def guarded_open(path_object, mode="r", *args, **kwargs):
            opened.append((path_object, mode))
            if path_object.suffix.lower() == ".xlsx":
                raise AssertionError("Panel evidence must never read a workbook.")
            if any(flag in mode for flag in ("w", "a", "x", "+")):
                raise AssertionError("Panel evidence must never open a file for writing.")
            return original_open(path_object, mode, *args, **kwargs)

        with mock.patch.object(Path, "open", guarded_open):
            report = panel.render_report()
        self.assertIn("Deterministic read-only report", report)
        self.assertTrue(opened)
        self.assertTrue(all(path.suffix.lower() != ".xlsx" for path, _mode in opened))
        self.assertTrue(all(not any(flag in mode for flag in ("w", "a", "x", "+")) for _path, mode in opened))

    def test_missing_or_inconsistent_evidence_fails_clearly(self):
        with self.assertRaisesRegex(panel.EvidenceError, "Missing committed evidence"):
            panel.render_report(Path("missing-ai-service-directory"))


if __name__ == "__main__":
    unittest.main()
