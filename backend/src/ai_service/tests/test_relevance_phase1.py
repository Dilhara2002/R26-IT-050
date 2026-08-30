import csv
from collections import Counter
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = AI_SERVICE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import prepare_relevance_phase1 as phase1
import validate_heldout_review_workbooks as reviewer_validator


REVIEW_A = phase1.EVALUATION_DIR / "reviewer_a_heldout_60.xlsx"
REVIEW_B = phase1.EVALUATION_DIR / "reviewer_b_heldout_60.xlsx"


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def workbook_sheet_names(path):
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read("xl/workbook.xml"))
    return [sheet.attrib["name"] for sheet in root.findall("m:sheets/m:sheet", reviewer_validator.NS)]


def copy_with_labels(source, destination, labels):
    """Create a test-only workbook copy with numeric labels in I6:I65."""
    with ZipFile(source) as input_archive:
        sheet_path = reviewer_validator.worksheet_path(input_archive, "Judgements")
        root = ET.fromstring(input_archive.read(sheet_path))
        for row_number, label in enumerate(labels, start=6):
            row = root.find(f"m:sheetData/m:row[@r='{row_number}']", reviewer_validator.NS)
            if row is None:
                raise AssertionError(f"Missing judgement row {row_number}")
            reference = f"I{row_number}"
            cell = row.find(f"m:c[@r='{reference}']", reviewer_validator.NS)
            if cell is None:
                cell = ET.SubElement(
                    row,
                    f"{{{reviewer_validator.NS['m']}}}c",
                    {"r": reference},
                )
            cell.attrib["t"] = "n"
            for child in list(cell):
                if child.tag.endswith("}v") or child.tag.endswith("}is"):
                    cell.remove(child)
            value = ET.SubElement(cell, f"{{{reviewer_validator.NS['m']}}}v")
            value.text = str(label)
        updated_sheet = ET.tostring(root, encoding="utf-8", xml_declaration=True)

        with ZipFile(destination, "w", ZIP_DEFLATED) as output_archive:
            for item in input_archive.infolist():
                payload = updated_sheet if item.filename == sheet_path else input_archive.read(item.filename)
                output_archive.writestr(item, payload)


class SourceAndSplitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profiles = phase1.read_csv(phase1.PROFILES_PATH)
        cls.places = phase1.read_csv(phase1.PLACES_PATH)

    def test_canonical_sources_are_exact_and_valid(self):
        checks = phase1.validate_sources(self.profiles, self.places)
        self.assertEqual(checks["profiles"], 15)
        self.assertEqual(checks["pois"], 20)
        self.assertEqual(checks["legacy_79"], 0)
        self.assertEqual(checks["duplicate_profile_ids"], 0)
        self.assertEqual(checks["duplicate_poi_ids"], 0)
        self.assertEqual(checks["duplicate_coordinates"], 0)
        self.assertEqual(checks["missing_interest_records"], 0)
        self.assertEqual(checks["missing_tag_records"], 0)
        self.assertEqual(checks["unverified_pois"], 0)

    def test_seed_42_profile_split_is_frozen_and_stratified(self):
        first = phase1.frozen_split(self.profiles)
        second = phase1.frozen_split(self.profiles)
        self.assertEqual(first, second)
        training, heldout = first
        self.assertEqual(
            training,
            ["P01", "P02", "P03", "P04", "P05", "P07", "P09", "P10", "P11", "P12", "P14", "P15"],
        )
        self.assertEqual(heldout, ["P06", "P08", "P13"])
        by_id = {row["profile_id"]: row for row in self.profiles}
        self.assertEqual(
            [len(phase1.normalized_set(by_id[profile_id]["user_interests"])) for profile_id in heldout],
            [1, 2, 3],
        )
        self.assertFalse(set(training) & set(heldout))

    def test_exported_split_matches_the_frozen_procedure(self):
        rows = read_csv(phase1.DEFAULT_SPLIT_OUT)
        self.assertEqual(len(rows), 15)
        self.assertTrue(all(row["seed"] == "42" for row in rows))
        self.assertEqual(
            [row["profile_id"] for row in rows if row["split"] == "heldout"],
            ["P06", "P08", "P13"],
        )
        self.assertEqual(sum(row["split"] == "training" for row in rows), 12)


class WeakLabelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profiles = phase1.read_csv(phase1.PROFILES_PATH)
        cls.places = phase1.read_csv(phase1.PLACES_PATH)
        cls.training, cls.heldout = phase1.frozen_split(cls.profiles)
        cls.rows = phase1.build_weak_label_rows(cls.profiles, cls.places, cls.training)

    def test_weak_labels_cover_only_240_training_pairs(self):
        self.assertEqual(len(self.rows), 240)
        self.assertEqual(len({row["judgement_id"] for row in self.rows}), 240)
        self.assertEqual({row["profile_id"] for row in self.rows}, set(self.training))
        self.assertFalse({row["profile_id"] for row in self.rows} & set(self.heldout))

    def test_rule_is_reproducible_for_every_row(self):
        for row in self.rows:
            interests = phase1.normalized_set(row["user_interests"])
            tags = phase1.normalized_set(row["verified_poi_tags"])
            overlap = interests & tags
            expected = 0 if not overlap else 2 if overlap == interests else 1
            self.assertEqual(int(row["weak_label"]), expected)
            self.assertEqual(row["overlap_set"], "|".join(sorted(overlap)))
            self.assertAlmostEqual(float(row["interest_coverage"]), len(overlap) / len(interests), places=6)
            self.assertEqual(row["rule_version"], phase1.RULE_VERSION)

    def test_class_distribution_is_not_resampled_or_adjusted(self):
        distribution = Counter(int(row["weak_label"]) for row in self.rows)
        self.assertEqual(distribution, Counter({0: 126, 2: 64, 1: 50}))
        self.assertGreaterEqual(len(distribution), 2)

    def test_exported_weak_labels_match_in_memory_generation(self):
        exported = read_csv(phase1.DEFAULT_WEAK_LABELS_OUT)
        self.assertEqual(exported, self.rows)


class ReviewerWorkbookTests(unittest.TestCase):
    def test_packets_have_required_sheets_and_independent_blank_rows(self):
        self.assertEqual(workbook_sheet_names(REVIEW_A), ["Judgements", "Rubric", "POI Reference"])
        self.assertEqual(workbook_sheet_names(REVIEW_B), ["Judgements", "Rubric", "POI Reference"])
        rows_a, rows_b = reviewer_validator.validate_pair(REVIEW_A, REVIEW_B, expect_blank=True)
        self.assertEqual(len(rows_a), 60)
        self.assertEqual(len(rows_b), 60)
        self.assertEqual(rows_a, rows_b)
        self.assertFalse(any(row["relevance_label"] for row in rows_a))
        self.assertTrue(all("weak" not in field and "prediction" not in field for field in reviewer_validator.FIELDS))

    def test_packets_include_dropdown_frozen_headers_filters_and_counters(self):
        for path in (REVIEW_A, REVIEW_B):
            with ZipFile(path) as archive:
                sheet_path = reviewer_validator.worksheet_path(archive, "Judgements")
                root = ET.fromstring(archive.read(sheet_path))
                validations = root.findall("m:dataValidations/m:dataValidation", reviewer_validator.NS)
                self.assertEqual(len(validations), 1)
                self.assertEqual(validations[0].attrib.get("sqref"), "I6:I65")
                formula = validations[0].find("m:formula1", reviewer_validator.NS)
                self.assertIsNotNone(formula)
                self.assertIn("0", formula.text or "")
                pane = root.find("m:sheetViews/m:sheetView/m:pane", reviewer_validator.NS)
                self.assertIsNotNone(pane)
                self.assertEqual(pane.attrib.get("ySplit"), "5")
                table_parts = root.findall("m:tableParts/m:tablePart", reviewer_validator.NS)
                self.assertEqual(len(table_parts), 1)
                formulas = {
                    cell.attrib["r"]: (cell.find("m:f", reviewer_validator.NS).text or "")
                    for cell in root.findall("m:sheetData/m:row/m:c", reviewer_validator.NS)
                    if cell.find("m:f", reviewer_validator.NS) is not None
                }
                self.assertIn("COUNTIF", formulas["D3"])
                self.assertIn("COUNTBLANK", formulas["F3"])
                self.assertIn("COUNTA", formulas["H3"])
                self.assertIn("COMPLETE", formulas["J3"])

    def test_completed_integer_labels_validate_and_invalid_label_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            complete_a = directory / "review_a.xlsx"
            complete_b = directory / "review_b.xlsx"
            labels = [index % 3 for index in range(60)]
            copy_with_labels(REVIEW_A, complete_a, labels)
            copy_with_labels(REVIEW_B, complete_b, labels)
            rows_a, rows_b = reviewer_validator.validate_pair(complete_a, complete_b)
            self.assertEqual(len(rows_a), 60)
            self.assertEqual(rows_a, rows_b)

            invalid = directory / "review_b_invalid.xlsx"
            copy_with_labels(REVIEW_B, invalid, [3, *labels[1:]])
            with self.assertRaisesRegex(
                reviewer_validator.HeldoutReviewValidationError,
                "non-integer or invalid labels",
            ):
                reviewer_validator.validate_pair(complete_a, invalid)


if __name__ == "__main__":
    unittest.main()
