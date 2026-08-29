"""Print frozen relevance evidence for a panel demonstration without training or writes."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
import sys


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = AI_SERVICE_DIR / "models"
EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
ACTIVE_METADATA = MODELS_DIR / "user_poi_relevance_v1.metadata.json"
ACTIVE_ARTIFACT = MODELS_DIR / "user_poi_relevance_v1.joblib"
ACTIVE_METRICS = EVALUATION_DIR / "user_poi_relevance_metrics_v1.json"
MODEL_COMPARISON = EVALUATION_DIR / "user_poi_relevance_model_comparison_v1.csv"
V2_METADATA = MODELS_DIR / "user_poi_relevance_v2_candidate.metadata.json"
V2_EVALUATION = EVALUATION_DIR / "user_poi_relevance_v2_single_reviewer_evaluation_v1.json"
EXPECTED_MODELS = ("Dummy", "Decision Tree", "Random Forest", "Linear SVM")


class EvidenceError(RuntimeError):
    """Frozen evidence is missing or internally inconsistent."""


def _read_json(path: Path):
    if not path.is_file():
        raise EvidenceError(f"Missing committed evidence file: {path.name}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EvidenceError(f"Invalid committed JSON evidence: {path.name}") from error


def _sha256(path: Path):
    if not path.is_file():
        raise EvidenceError(f"Missing active artifact: {path.name}")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _read_comparison(path: Path):
    if not path.is_file():
        raise EvidenceError(f"Missing model comparison: {path.name}")
    with path.open("r", encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source))
    by_model = {row.get("model"): row for row in rows}
    if tuple(name for name in EXPECTED_MODELS if name in by_model) != EXPECTED_MODELS:
        raise EvidenceError("Model comparison does not contain the four expected models.")
    return by_model


def _metric(value):
    return f"{float(value):.6f}"


def _distribution(value):
    return ", ".join(f"class {key}={value[key]}" for key in sorted(value, key=int))


def _matrix(value):
    return "[" + ", ".join("[" + ", ".join(str(cell) for cell in row) + "]" for row in value) + "]"


def render_report(ai_service_dir: Path = AI_SERVICE_DIR):
    models_dir = ai_service_dir / "models"
    evaluation_dir = ai_service_dir / "data" / "evaluation"
    metadata_path = models_dir / ACTIVE_METADATA.name
    artifact_path = models_dir / ACTIVE_ARTIFACT.name
    metrics_path = evaluation_dir / ACTIVE_METRICS.name
    comparison_path = evaluation_dir / MODEL_COMPARISON.name
    v2_metadata_path = models_dir / V2_METADATA.name
    v2_evaluation_path = evaluation_dir / V2_EVALUATION.name

    metadata = _read_json(metadata_path)
    metrics = _read_json(metrics_path)
    comparison = _read_comparison(comparison_path)
    v2_metadata = _read_json(v2_metadata_path)
    v2_evaluation = _read_json(v2_evaluation_path)

    artifact_hash = _sha256(artifact_path)
    if artifact_hash != metadata.get("artifact_sha256"):
        raise EvidenceError("Active artifact SHA-256 does not match committed metadata.")
    selected_model = metrics.get("selection", {}).get("selected_model")
    if metadata.get("classifier") != "Linear SVM" or selected_model != "Linear SVM":
        raise EvidenceError("Active metadata and evaluation do not agree on Linear SVM.")
    heldout = metrics.get("heldout_evaluation", {}).get("models", {}).get(selected_model)
    heldout_rows = metrics.get("datasets", {}).get("heldout", {}).get("rows")
    if not heldout or heldout_rows != 60:
        raise EvidenceError("Active human-heldout evidence is incomplete.")
    correct = sum(
        heldout["confusion_matrix"][index][index]
        for index in range(len(heldout["confusion_matrix"]))
    )
    if correct != 41 or abs(float(heldout["accuracy"]) - (41 / 60)) > 1e-12:
        raise EvidenceError("Active 41/60 accuracy evidence is inconsistent.")
    if v2_metadata.get("runtime_activated") is not False:
        raise EvidenceError("The v2 candidate is unexpectedly marked active.")
    v2_metrics = v2_evaluation.get("metrics", {})
    if v2_metrics.get("correct") != 36 or v2_metrics.get("total") != 60:
        raise EvidenceError("Rejected-v2 evaluation totals are inconsistent.")
    if v2_evaluation.get("activation_gate", {}).get("passed") is not False:
        raise EvidenceError("Rejected-v2 activation gate is not FAIL.")

    lines = [
        "=" * 78,
        "SMART ITINERARY - FROZEN RELEVANCE PANEL EVIDENCE",
        "Deterministic read-only report; no training, tuning, selection, or writes.",
        "=" * 78,
        "",
        "ACTIVE RUNTIME MODEL",
        f"Model: {metadata['classifier']} ({metadata['model_name']} {metadata['model_version']})",
        f"Artifact: {artifact_path.name}",
        f"Artifact SHA-256: {artifact_hash}",
        f"Runtime role: {metadata['runtime_role']}",
        "",
        "HUMAN-REVIEWED HELD-OUT EVALUATION - ACTIVE V1",
        "Evaluation set: final_human_reviewed_heldout_60.csv",
        "Scope: 60 adjudicated user-profile-POI relevance judgements; three held-out Kandy profiles; 20 verified Kandy POIs.",
        f"Human-reviewed rows: {heldout_rows}",
        f"Correct predictions: {correct}/{heldout_rows}",
        "Active human-reviewed accuracy:",
        "41/60 = 68.3333%",
        f"Macro-F1: {_metric(heldout['macro_f1'])}",
        f"Balanced accuracy: {_metric(heldout['balanced_accuracy'])}",
        f"Weighted-F1: {_metric(heldout['weighted_f1'])}",
        f"Actual class distribution: {_distribution(heldout['actual_distribution'])}",
        f"Predicted class distribution: {_distribution(heldout['predicted_distribution'])}",
        f"Confusion matrix (rows actual 0/1/2; columns predicted 0/1/2): {_matrix(heldout['confusion_matrix'])}",
        "Per-class metrics:",
    ]
    for class_name in sorted(heldout["per_class"], key=int):
        values = heldout["per_class"][class_name]
        lines.append(
            f"  class {class_name}: precision={_metric(values['precision'])}, "
            f"recall={_metric(values['recall'])}, f1={_metric(values['f1'])}, "
            f"support={values['support']}"
        )

    lines.extend([
        "",
        "HUMAN-HELDOUT MODEL COMPARISON - SAME 60 ROWS",
        "Model           Accuracy   BalancedAcc  Macro-F1  Weighted-F1",
    ])
    for name in EXPECTED_MODELS:
        row = comparison[name]
        lines.append(
            f"{name:<15} {_metric(row['heldout_accuracy']):>9}   "
            f"{_metric(row['heldout_balanced_accuracy']):>11}  "
            f"{_metric(row['heldout_macro_f1']):>8}  {_metric(row['heldout_weighted_f1']):>11}"
        )

    selection = metrics["selection"]
    svm_snapshot = selection["training_only_snapshot"]["Linear SVM"]
    forest_snapshot = selection["training_only_snapshot"]["Random Forest"]
    lines.extend([
        "",
        "MODEL SELECTION - WEAK-SUPERVISION GROUPED CV (NOT HUMAN ACCURACY)",
        "Method: 4-fold StratifiedGroupKFold by profile_id; held-out profiles used for selection: no.",
        f"Linear SVM weak-CV Macro-F1: {_metric(svm_snapshot['cv_macro_f1_mean'])}",
        f"Random Forest weak-CV Macro-F1: {_metric(forest_snapshot['cv_macro_f1_mean'])}",
        f"Selected model: {selection['selected_model']}",
        f"Exact selection rule: {selection['rule']}",
        "Selected-model rationale: Linear SVM had the higher grouped weak-CV Macro-F1 among the deployment-eligible candidates; the human-heldout set was not used for selection.",
        "",
        "REJECTED V2 CANDIDATE - SINGLE-REVIEWER EXTENSION (NOT ACTIVE)",
        f"Candidate: {v2_metadata['classifier']} ({v2_metadata['model_version']})",
        f"Runtime activated: {str(v2_metadata['runtime_activated']).lower()}",
        f"Evaluation scope: {v2_evaluation['scope']['rows']} rows, {v2_evaluation['scope']['verified_pois']} verified Matale/Nuwara Eliya POIs, single reviewer.",
        f"Correct predictions: {v2_metrics['correct']}/{v2_metrics['total']}",
        f"Accuracy: {_metric(v2_metrics['accuracy'])}",
        f"Macro-F1: {_metric(v2_metrics['macro_f1'])}",
        f"Balanced accuracy: {_metric(v2_metrics['balanced_accuracy'])}",
        f"Weighted-F1: {_metric(v2_metrics['weighted_f1'])}",
        f"Confusion matrix: {_matrix(v2_metrics['confusion_matrix'])}",
        "V2 activation gate: FAIL",
        "",
        "PANEL CLAIM WARNINGS",
        "- Do not present weak-supervision CV as human-reviewed accuracy.",
        "- Do not claim 800 examples are 800 tourist places; they are profile-POI pairs.",
        "- Do not claim 68.3333% is itinerary quality, route optimality, user satisfaction, or nationwide accuracy.",
        "- Do not present rejected v2 as active or independently dual-reviewed evidence.",
        "- Do not claim Gemini selects or optimizes routes; it only explains a finalized itinerary.",
        "=" * 78,
    ])
    return "\n".join(lines)


def main():
    try:
        print(render_report())
        return 0
    except EvidenceError as error:
        print(f"PANEL EVIDENCE ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
