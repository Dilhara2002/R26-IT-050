"""One-time evaluation of the frozen v2 candidate on validated Reviewer A labels."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
from xml.sax.saxutils import escape

import joblib
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from relevance_features_v2 import make_pair_frame  # noqa: E402
import validate_central_extension_review_workbooks as packet_validator  # noqa: E402


EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
MODELS_DIR = AI_SERVICE_DIR / "models"
DEFAULT_WORKBOOK = Path(
    r"C:\Users\user\Downloads\reviewer_a_central_extension_60_completed.xlsx"
)
ARTIFACT_PATH = MODELS_DIR / "user_poi_relevance_v2_candidate.joblib"
METADATA_PATH = ARTIFACT_PATH.with_suffix(".metadata.json")
LABELS_OUT = EVALUATION_DIR / "central_province_reviewer_a_extension_labels_v1.csv"
RESULTS_OUT = EVALUATION_DIR / "user_poi_relevance_v2_single_reviewer_results_v1.csv"
METRICS_OUT = EVALUATION_DIR / "user_poi_relevance_v2_single_reviewer_evaluation_v1.json"
REPORT_OUT = EVALUATION_DIR / "user_poi_relevance_v2_single_reviewer_report_v1.md"
CONFUSION_OUT = EVALUATION_DIR / "user_poi_relevance_v2_single_reviewer_confusion_v1.svg"

EXPECTED_ARTIFACT_SHA256 = "f1d6ce2c018658d3305c4772a40f959bcff4b9041e3eacff8726bdb82bf82913"
EXPECTED_PROFILES = {"P06", "P08", "P13"}
EXPECTED_DISTRICTS = {"Matale": 30, "Nuwara Eliya": 30}
LABELS = (0, 1, 2)
BOOTSTRAP_SEED = 42
BOOTSTRAP_SAMPLES = 5000
COORDINATE_TOLERANCE_DEGREES = 1e-9

LABEL_FIELDS = (
    "source_row_number",
    "judgement_id",
    "profile_id",
    "user_interests",
    "place_id",
    "poi_name",
    "district",
    "latitude",
    "longitude",
    "verified_poi_tags",
    "source_name",
    "source_url",
    "human_relevance_label",
    "reviewer_notes",
    "label_provenance",
    "reviewer_scope",
    "source_workbook_sha256",
)
RESULT_FIELDS = (
    "judgement_id",
    "profile_id",
    "place_id",
    "poi_name",
    "district",
    "human_relevance_label",
    "predicted_relevance_label",
    "correct",
    "label_provenance",
    "candidate_artifact_sha256",
)


class SingleReviewerEvaluationError(ValueError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_completed_workbook(path: Path) -> tuple[list[dict[str, str]], dict]:
    """Validate Reviewer A alone; never load Reviewer B or a blank workbook."""
    header, rows = packet_validator.read_judgements(path)
    expected, training_ids = packet_validator.canonical_rows()
    if header != packet_validator.FIELDS:
        raise SingleReviewerEvaluationError("Invalid Judgements header.")
    ids = [row["judgement_id"] for row in rows]
    if len(rows) != 60 or len(set(ids)) != 60 or set(ids) != set(expected):
        raise SingleReviewerEvaluationError("Workbook must contain the exact 60 canonical judgements.")

    exact_fields = (
        "judgement_id",
        "profile_id",
        "user_interests",
        "place_id",
        "poi_name",
        "district",
        "verified_poi_tags",
        "source_name",
        "source_url",
    )
    for row in rows:
        canonical = expected[row["judgement_id"]]
        for field in exact_fields:
            expected_value = canonical[packet_validator.IDENTITY_FIELDS.index(field)]
            if row[field] != expected_value:
                raise SingleReviewerEvaluationError(
                    f"Canonical {field} changed for {row['judgement_id']}."
                )
        for field in ("latitude", "longitude"):
            expected_value = canonical[packet_validator.IDENTITY_FIELDS.index(field)]
            try:
                delta = abs(float(row[field]) - float(expected_value))
            except ValueError as error:
                raise SingleReviewerEvaluationError(
                    f"Invalid {field} for {row['judgement_id']}."
                ) from error
            if delta > COORDINATE_TOLERANCE_DEGREES:
                raise SingleReviewerEvaluationError(
                    f"Canonical {field} changed for {row['judgement_id']}."
                )

    profiles = {row["profile_id"] for row in rows}
    places = {row["place_id"] for row in rows}
    pairs = {(row["profile_id"], row["place_id"]) for row in rows}
    district_counts = {
        district: sum(row["district"] == district for row in rows)
        for district in EXPECTED_DISTRICTS
    }
    poi_counts = {
        district: len({row["place_id"] for row in rows if row["district"] == district})
        for district in EXPECTED_DISTRICTS
    }
    if profiles != EXPECTED_PROFILES:
        raise SingleReviewerEvaluationError("Workbook profiles are not exactly P06/P08/P13.")
    if profiles & training_ids:
        raise SingleReviewerEvaluationError("Training-profile leakage detected.")
    if len(places) != 20 or poi_counts != {"Matale": 10, "Nuwara Eliya": 10}:
        raise SingleReviewerEvaluationError("Workbook must cover exactly 20 new POIs, 10 per district.")
    if district_counts != EXPECTED_DISTRICTS or any(row["district"] == "Kandy" for row in rows):
        raise SingleReviewerEvaluationError("Workbook district scope changed.")
    if len(pairs) != 60:
        raise SingleReviewerEvaluationError("Duplicate profile/POI pairs detected.")
    if any(row["relevance_label"] not in packet_validator.ALLOWED_LABELS for row in rows):
        raise SingleReviewerEvaluationError("Labels must be complete integers 0, 1, or 2.")

    distribution = {
        str(label): sum(row["relevance_label"] == str(label) for row in rows)
        for label in LABELS
    }
    return rows, {
        "rows": len(rows),
        "unique_judgement_ids": len(set(ids)),
        "profiles": sorted(profiles),
        "unique_pois": len(places),
        "judgements_by_district": district_counts,
        "unique_pois_by_district": poi_counts,
        "duplicate_profile_poi_pairs": len(rows) - len(pairs),
        "training_profile_leakage": sorted(profiles & training_ids),
        "human_label_distribution": distribution,
    }


def metric_bundle(actual, predicted) -> dict:
    actual = np.asarray(actual, dtype=int)
    predicted = np.asarray(predicted, dtype=int)
    precision, recall, f1, support = precision_recall_fscore_support(
        actual, predicted, labels=LABELS, zero_division=0
    )
    return {
        "correct": int(np.sum(actual == predicted)),
        "total": int(len(actual)),
        "accuracy": float(accuracy_score(actual, predicted)),
        "balanced_accuracy": float(balanced_accuracy_score(actual, predicted)),
        "macro_f1": float(f1_score(actual, predicted, labels=LABELS, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(actual, predicted, labels=LABELS, average="weighted", zero_division=0)),
        "per_class": {
            str(label): {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int(support[index]),
            }
            for index, label in enumerate(LABELS)
        },
        "actual_distribution": {
            str(label): int(np.sum(actual == label)) for label in LABELS
        },
        "predicted_distribution": {
            str(label): int(np.sum(predicted == label)) for label in LABELS
        },
        "confusion_matrix": confusion_matrix(actual, predicted, labels=LABELS).tolist(),
    }


def bootstrap_intervals(actual, predicted, samples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED) -> dict:
    """Fixed-seed stratified bootstrap preserving represented-class support."""
    actual = np.asarray(actual, dtype=int)
    predicted = np.asarray(predicted, dtype=int)
    rng = np.random.default_rng(seed)
    class_indices = [np.flatnonzero(actual == label) for label in LABELS if np.any(actual == label)]
    values = {"accuracy": [], "balanced_accuracy": [], "macro_f1": []}
    for _ in range(samples):
        indices = np.concatenate(
            [rng.choice(group, size=len(group), replace=True) for group in class_indices]
        )
        sampled_actual = actual[indices]
        sampled_predicted = predicted[indices]
        values["accuracy"].append(accuracy_score(sampled_actual, sampled_predicted))
        values["balanced_accuracy"].append(
            balanced_accuracy_score(sampled_actual, sampled_predicted)
        )
        values["macro_f1"].append(
            f1_score(
                sampled_actual,
                sampled_predicted,
                labels=LABELS,
                average="macro",
                zero_division=0,
            )
        )
    return {
        metric: {
            "lower_95": float(np.percentile(metric_values, 2.5)),
            "upper_95": float(np.percentile(metric_values, 97.5)),
        }
        for metric, metric_values in values.items()
    }


def activation_gate(metrics: dict) -> dict:
    represented = [label for label in LABELS if metrics["per_class"][str(label)]["support"] > 0]
    conditions = {
        "accuracy_at_least_0_80": {
            "value": metrics["accuracy"],
            "threshold": 0.80,
            "passed": metrics["accuracy"] >= 0.80 and metrics["correct"] >= 48,
        },
        "macro_f1_at_least_0_65": {
            "value": metrics["macro_f1"],
            "threshold": 0.65,
            "passed": metrics["macro_f1"] >= 0.65,
        },
        "balanced_accuracy_at_least_0_70": {
            "value": metrics["balanced_accuracy"],
            "threshold": 0.70,
            "passed": metrics["balanced_accuracy"] >= 0.70,
        },
        "recall_at_least_0_50_every_represented_class": {
            "values": {
                str(label): metrics["per_class"][str(label)]["recall"]
                for label in represented
            },
            "threshold": 0.50,
            "passed": all(
                metrics["per_class"][str(label)]["recall"] >= 0.50
                for label in represented
            ),
        },
    }
    return {
        "passed": all(condition["passed"] for condition in conditions.values()),
        "conditions": conditions,
    }


def confusion_svg(matrix: list[list[int]]) -> str:
    width, height = 620, 500
    left, top, cell = 160, 100, 100
    maximum = max(max(row) for row in matrix) or 1
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="310" y="38" text-anchor="middle" font-family="Arial" font-size="20" font-weight="bold">Frozen v2 candidate — single-reviewer extension evaluation</text>',
        '<text x="310" y="66" text-anchor="middle" font-family="Arial" font-size="13">Rows: actual human label · Columns: predicted label</text>',
    ]
    for index, label in enumerate(LABELS):
        parts.append(f'<text x="{left + index * cell + cell / 2}" y="90" text-anchor="middle" font-family="Arial" font-size="14">Pred {label}</text>')
        parts.append(f'<text x="145" y="{top + index * cell + cell / 2 + 5}" text-anchor="end" font-family="Arial" font-size="14">Actual {label}</text>')
    for row_index, row in enumerate(matrix):
        for column_index, value in enumerate(row):
            intensity = value / maximum
            blue = int(245 - 140 * intensity)
            fill = f"rgb({blue},{blue + 5},{255})"
            x, y = left + column_index * cell, top + row_index * cell
            parts.append(f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" fill="{fill}" stroke="#1f4e78"/>')
            parts.append(f'<text x="{x + cell / 2}" y="{y + cell / 2 + 8}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold">{value}</text>')
    parts.append('<text x="310" y="445" text-anchor="middle" font-family="Arial" font-size="12">20 verified Matale/Nuwara Eliya POIs · 3 held-out profiles · one human reviewer</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def report_markdown(result: dict) -> str:
    metrics = result["metrics"]
    gate = result["activation_gate"]
    lines = [
        "# Frozen v2 relevance candidate — single-reviewer extension evaluation",
        "",
        "This is a one-time, single-reviewer human relevance evaluation across 20 verified Matale/Nuwara Eliya POIs and three held-out profiles. It is not an independent dual review and is not combined with the prior Kandy development/reference result.",
        "",
        f"- Workbook SHA-256: `{result['workbook']['sha256']}`",
        f"- Candidate SHA-256: `{result['candidate']['artifact_sha256']}`",
        f"- Correct predictions: **{metrics['correct']}/{metrics['total']}**",
        f"- Accuracy: **{metrics['accuracy']:.6f}**",
        f"- Balanced accuracy: **{metrics['balanced_accuracy']:.6f}**",
        f"- Macro-F1: **{metrics['macro_f1']:.6f}**",
        f"- Weighted-F1: **{metrics['weighted_f1']:.6f}**",
        "",
        "## Class distributions",
        "",
        f"- Actual: `{metrics['actual_distribution']}`",
        f"- Predicted: `{metrics['predicted_distribution']}`",
        "",
        "## Per-class metrics",
        "",
        "| Class | Precision | Recall | F1 | Support |",
        "|---:|---:|---:|---:|---:|",
    ]
    for label in LABELS:
        values = metrics["per_class"][str(label)]
        lines.append(
            f"| {label} | {values['precision']:.6f} | {values['recall']:.6f} | {values['f1']:.6f} | {values['support']} |"
        )
    lines.extend(
        (
            "",
            "## Confusion matrix",
            "",
            f"`{metrics['confusion_matrix']}`",
            "",
            "## Fixed-seed stratified bootstrap 95% intervals",
            "",
        )
    )
    for metric, interval in result["bootstrap_95_percent"] .items():
        lines.append(
            f"- {metric}: [{interval['lower_95']:.6f}, {interval['upper_95']:.6f}]"
        )
    lines.extend(("", "## Activation gate", "", f"Overall: **{'PASS' if gate['passed'] else 'FAIL'}**", ""))
    for name, condition in gate["conditions"].items():
        lines.append(f"- {name}: **{'PASS' if condition['passed'] else 'FAIL'}** — `{condition}`")
    lines.extend(
        (
            "",
            "## Misclassified judgement IDs",
            "",
            f"`{result['misclassified_judgement_ids']}`",
            "",
            "Panel-safe sentence: The frozen v2 relevance candidate was evaluated once against 60 labels from one human reviewer covering 20 verified Matale/Nuwara Eliya POIs and three held-out profiles; the reported accuracy applies only to that bounded evaluation.",
            "",
        )
    )
    return "\n".join(lines)


def write_csv(path: Path, fieldnames: tuple[str, ...], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--confirm-one-time-evaluation", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.confirm_one_time_evaluation:
        raise SystemExit("Refusing evaluation without --confirm-one-time-evaluation.")
    outputs = (LABELS_OUT, RESULTS_OUT, METRICS_OUT, REPORT_OUT, CONFUSION_OUT)
    if any(path.exists() for path in outputs):
        raise SystemExit("Refusing to rerun: one-time evaluation output already exists.")

    rows, validation = validate_completed_workbook(args.workbook)
    workbook_hash = sha256(args.workbook)
    artifact_hash = sha256(ARTIFACT_PATH)
    if artifact_hash != EXPECTED_ARTIFACT_SHA256:
        raise SingleReviewerEvaluationError("Frozen candidate SHA-256 changed.")
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    if metadata["artifact_sha256"] != artifact_hash:
        raise SingleReviewerEvaluationError("Candidate metadata hash mismatch.")
    candidate = joblib.load(ARTIFACT_PATH)
    if candidate.named_steps["features"].seen_row_count_ != 680:
        raise SingleReviewerEvaluationError("Candidate was not fit on exactly 680 rows.")
    if list(map(int, candidate.classes_)) != list(LABELS):
        raise SingleReviewerEvaluationError("Candidate classes changed.")

    actual = np.asarray([int(row["relevance_label"]) for row in rows], dtype=int)
    prediction_frame = make_pair_frame(
        [row["user_interests"] for row in rows],
        [row["verified_poi_tags"] for row in rows],
    )
    predicted = candidate.predict(prediction_frame).astype(int)  # exactly one prediction call
    metrics = metric_bundle(actual, predicted)
    intervals = bootstrap_intervals(actual, predicted)
    gate = activation_gate(metrics)
    misclassified = [
        row["judgement_id"]
        for row, actual_label, predicted_label in zip(rows, actual, predicted)
        if actual_label != predicted_label
    ]

    label_rows = []
    result_rows = []
    for source_row, row, actual_label, predicted_label in zip(
        range(6, 66), rows, actual, predicted
    ):
        label_rows.append(
            {
                "source_row_number": source_row,
                **{field: row[field] for field in packet_validator.IDENTITY_FIELDS},
                "human_relevance_label": int(actual_label),
                "reviewer_notes": row["reviewer_notes"],
                "label_provenance": "single_human_reviewer",
                "reviewer_scope": "reviewer_a_only_no_agreement_or_adjudication",
                "source_workbook_sha256": workbook_hash,
            }
        )
        result_rows.append(
            {
                "judgement_id": row["judgement_id"],
                "profile_id": row["profile_id"],
                "place_id": row["place_id"],
                "poi_name": row["poi_name"],
                "district": row["district"],
                "human_relevance_label": int(actual_label),
                "predicted_relevance_label": int(predicted_label),
                "correct": actual_label == predicted_label,
                "label_provenance": "single_human_reviewer",
                "candidate_artifact_sha256": artifact_hash,
            }
        )

    result = {
        "evaluation_id": "central_province_v2_single_reviewer_extension_v1",
        "evaluation_status": "completed_once_frozen",
        "scope": {
            "reviewer_status": "single_human_reviewer",
            "rows": 60,
            "verified_pois": 20,
            "districts": ["Matale", "Nuwara Eliya"],
            "heldout_profiles": sorted(EXPECTED_PROFILES),
            "not_combined_with_kandy_reference": True,
        },
        "workbook": {
            "path": str(args.workbook.resolve()),
            "sha256": workbook_hash,
            "validation": validation,
        },
        "candidate": {
            "path": str(ARTIFACT_PATH.resolve()),
            "artifact_sha256": artifact_hash,
            "metadata_sha256": sha256(METADATA_PATH),
            "model_version": metadata["model_version"],
            "classifier": metadata["classifier"],
            "training_rows": metadata["training_row_count"],
            "training_supervision": "rule_derived_weak_supervision_not_human",
            "refit_or_retuning_performed": False,
        },
        "metrics": metrics,
        "bootstrap": {
            "method": "fixed-seed stratified nonparametric bootstrap",
            "seed": BOOTSTRAP_SEED,
            "samples": BOOTSTRAP_SAMPLES,
        },
        "bootstrap_95_percent": intervals,
        "misclassified_judgement_ids": misclassified,
        "activation_gate": gate,
    }
    write_csv(LABELS_OUT, LABEL_FIELDS, label_rows)
    write_csv(RESULTS_OUT, RESULT_FIELDS, result_rows)
    METRICS_OUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    REPORT_OUT.write_text(report_markdown(result), encoding="utf-8")
    CONFUSION_OUT.write_text(confusion_svg(metrics["confusion_matrix"]), encoding="utf-8")

    print(f"Workbook SHA-256: {workbook_hash}")
    print(f"Human-label distribution: {metrics['actual_distribution']}")
    print(f"Correct: {metrics['correct']}/{metrics['total']}")
    print(f"Accuracy: {metrics['accuracy']:.6f}")
    print(f"Balanced accuracy: {metrics['balanced_accuracy']:.6f}")
    print(f"Macro-F1: {metrics['macro_f1']:.6f}")
    print(f"Weighted-F1: {metrics['weighted_f1']:.6f}")
    print(f"Activation gate: {'PASS' if gate['passed'] else 'FAIL'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
