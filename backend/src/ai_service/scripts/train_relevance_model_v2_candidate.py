"""Compare and freeze a v2 candidate using weak-labelled training rows only.

This module never loads the evaluation grid or reviewer workbooks. All tuning,
selection, preprocessing, and diagnostics use grouped validation over the 17
weak-supervision training profiles.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.model_selection import ParameterGrid, StratifiedGroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from relevance_features_v2 import (  # noqa: E402
    EXCLUDED_LEAKAGE_FIELDS,
    FEATURE_NAMES,
    REQUIRED_INPUT_COLUMNS,
    RelevancePairFeaturesV2,
)


EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
MODELS_DIR = AI_SERVICE_DIR / "models"
TRAIN_PATH = EVALUATION_DIR / "rule_derived_weak_training_labels_v2.csv"
SPLIT_PATH = EVALUATION_DIR / "central_province_profile_split_v2.csv"
ARTIFACT_PATH = MODELS_DIR / "user_poi_relevance_v2_candidate.joblib"
METADATA_PATH = MODELS_DIR / "user_poi_relevance_v2_candidate.metadata.json"
METRICS_PATH = EVALUATION_DIR / "user_poi_relevance_v2_weak_cv_metrics.json"
COMPARISON_PATH = EVALUATION_DIR / "user_poi_relevance_v2_model_comparison.csv"
REPORT_PATH = EVALUATION_DIR / "user_poi_relevance_v2_weak_cv_report.md"

SEED = 42
CV_SPLITS = 5
LABELS = (0, 1, 2)
WEAK_RULE = "verified_tag_interest_coverage_v1"
SELECTION_TOLERANCE = 0.01
EXPECTED_TRAINING_PROFILES = 17
EXPECTED_TRAINING_ROWS = 680


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, Path):
        return str(value)
    return value


def load_training_data(
    train_path: Path = TRAIN_PATH, split_path: Path = SPLIT_PATH
) -> tuple[pd.DataFrame, pd.DataFrame, list[str], list[str]]:
    """Load only weak training rows and the label-free profile split manifest."""
    frame = pd.read_csv(train_path)
    split = pd.read_csv(split_path)
    required = {
        *REQUIRED_INPUT_COLUMNS,
        "judgement_id",
        "profile_id",
        "place_id",
        "weak_label",
        "label_provenance",
        "rule_version",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Weak-training data missing columns: {sorted(missing)}")
    if len(frame) != EXPECTED_TRAINING_ROWS:
        raise ValueError(f"Expected exactly {EXPECTED_TRAINING_ROWS} weak-training rows.")
    if frame["profile_id"].nunique() != EXPECTED_TRAINING_PROFILES:
        raise ValueError(f"Expected exactly {EXPECTED_TRAINING_PROFILES} training profiles.")
    if frame["judgement_id"].nunique() != EXPECTED_TRAINING_ROWS:
        raise ValueError("Weak-training judgement IDs must be unique.")
    if frame[["profile_id", "place_id"]].duplicated().any():
        raise ValueError("Weak-training profile/POI pairs must be unique.")
    if not frame["weak_label"].isin(LABELS).all():
        raise ValueError("Weak labels must remain integer classes 0, 1, and 2.")
    if not frame["label_provenance"].eq("rule_derived_weak_supervision_not_human").all():
        raise ValueError("Training rows must be explicitly non-human weak supervision.")
    if not frame["rule_version"].eq(WEAK_RULE).all():
        raise ValueError("Unexpected weak-label rule version.")

    training_ids = split.loc[split["split"] == "training", "profile_id"].tolist()
    excluded_ids = split.loc[split["split"] == "heldout", "profile_id"].tolist()
    if len(training_ids) != 17 or len(excluded_ids) != 3:
        raise ValueError("Split manifest must contain 17 training and 3 excluded profiles.")
    if set(training_ids) & set(excluded_ids):
        raise ValueError("Training and excluded profile IDs overlap.")
    if set(frame["profile_id"]) != set(training_ids):
        raise ValueError("Weak-training rows do not match the split manifest.")
    if not frame.groupby("profile_id").size().eq(40).all():
        raise ValueError("Every training profile must contain exactly 40 POI pairs.")
    return frame, split, training_ids, excluded_ids


def grouped_splits(frame: pd.DataFrame) -> list[tuple[np.ndarray, np.ndarray]]:
    splitter = StratifiedGroupKFold(
        n_splits=CV_SPLITS, shuffle=True, random_state=SEED
    )
    y = frame["weak_label"].astype(int)
    groups = frame["profile_id"]
    splits = list(splitter.split(frame, y, groups))
    for train_indices, validation_indices in splits:
        train_groups = set(groups.iloc[train_indices])
        validation_groups = set(groups.iloc[validation_indices])
        if train_groups & validation_groups:
            raise AssertionError("Profile leakage detected inside grouped CV.")
    return splits


def pipeline(classifier, scale: bool = False) -> Pipeline:
    steps = [("features", RelevancePairFeaturesV2())]
    if scale:
        steps.append(("scale", StandardScaler()))
    steps.append(("classifier", classifier))
    return Pipeline(steps)


def candidate_specs() -> dict[str, dict]:
    return {
        "Dummy": {
            "pipeline": pipeline(DummyClassifier(strategy="most_frequent")),
            "grid": [{}],
            "deployment_eligible": False,
        },
        "Decision Tree": {
            "pipeline": pipeline(DecisionTreeClassifier(random_state=SEED)),
            "grid": list(
                ParameterGrid(
                    {
                        "classifier__max_depth": [2, 4, None],
                        "classifier__min_samples_leaf": [1, 5],
                        "classifier__class_weight": [None, "balanced"],
                    }
                )
            ),
            "deployment_eligible": False,
        },
        "Random Forest": {
            "pipeline": pipeline(
                RandomForestClassifier(random_state=SEED, n_jobs=1)
            ),
            "grid": list(
                ParameterGrid(
                    {
                        "classifier__n_estimators": [100, 200],
                        "classifier__max_depth": [6, None],
                        "classifier__min_samples_leaf": [1, 3],
                        "classifier__max_features": ["sqrt", 0.75],
                        "classifier__class_weight": [None, "balanced"],
                    }
                )
            ),
            "deployment_eligible": True,
        },
        "Linear SVM": {
            "pipeline": pipeline(
                SVC(kernel="linear", probability=False, random_state=SEED), scale=True
            ),
            "grid": list(
                ParameterGrid(
                    {
                        "classifier__C": [0.1, 1.0, 10.0],
                        "classifier__class_weight": [None, "balanced"],
                    }
                )
            ),
            "deployment_eligible": True,
        },
    }


def label_distribution(values) -> dict[str, int]:
    counts = pd.Series(values).value_counts().sort_index()
    return {str(label): int(counts.get(label, 0)) for label in LABELS}


def metric_bundle(y_true, y_pred) -> dict:
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=LABELS, zero_division=0
    )
    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "balanced_accuracy": balanced_accuracy_score(y_true, y_pred),
        "macro_f1": f1_score(y_true, y_pred, labels=LABELS, average="macro", zero_division=0),
        "weighted_f1": f1_score(y_true, y_pred, labels=LABELS, average="weighted", zero_division=0),
        "per_class": {
            str(label): {
                "precision": precision[index],
                "recall": recall[index],
                "f1": f1[index],
                "support": int(support[index]),
            }
            for index, label in enumerate(LABELS)
        },
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=LABELS),
        "actual_distribution": label_distribution(y_true),
        "predicted_distribution": label_distribution(y_pred),
    }


def evaluate_configuration(template, parameters, X, y, splits) -> dict:
    fold_predictions = np.empty(len(y), dtype=int)
    fold_metrics = []
    for train_indices, validation_indices in splits:
        estimator = clone(template).set_params(**parameters)
        estimator.fit(X.iloc[train_indices], y.iloc[train_indices])
        train_prediction = estimator.predict(X.iloc[train_indices])
        validation_prediction = estimator.predict(X.iloc[validation_indices])
        fold_predictions[validation_indices] = validation_prediction
        train_bundle = metric_bundle(y.iloc[train_indices], train_prediction)
        validation_bundle = metric_bundle(y.iloc[validation_indices], validation_prediction)
        fold_metrics.append(
            {
                metric: {
                    "training": train_bundle[metric],
                    "validation": validation_bundle[metric],
                }
                for metric in ("accuracy", "balanced_accuracy", "macro_f1", "weighted_f1")
            }
        )
    summary = {}
    for metric in ("accuracy", "balanced_accuracy", "macro_f1", "weighted_f1"):
        training = np.asarray([fold[metric]["training"] for fold in fold_metrics])
        validation = np.asarray([fold[metric]["validation"] for fold in fold_metrics])
        summary[metric] = {
            "training_mean": training.mean(),
            "training_std": training.std(),
            "validation_mean": validation.mean(),
            "validation_std": validation.std(),
            "gap": training.mean() - validation.mean(),
            "fold_training_scores": training,
            "fold_validation_scores": validation,
        }
    return {
        "parameters": parameters,
        "cv": summary,
        "oof_metrics": metric_bundle(y, fold_predictions),
        "oof_predictions": fold_predictions,
    }


def simplicity_key(model_name: str, parameters: dict) -> tuple:
    if model_name == "Dummy":
        return (0,)
    if model_name == "Decision Tree":
        depth = parameters["classifier__max_depth"]
        return (
            999 if depth is None else depth,
            -parameters["classifier__min_samples_leaf"],
            int(parameters["classifier__class_weight"] is not None),
            str(parameters),
        )
    if model_name == "Random Forest":
        depth = parameters["classifier__max_depth"]
        return (
            parameters["classifier__n_estimators"],
            999 if depth is None else depth,
            -parameters["classifier__min_samples_leaf"],
            int(parameters["classifier__class_weight"] is not None),
            str(parameters),
        )
    return (
        parameters["classifier__C"],
        int(parameters["classifier__class_weight"] is not None),
        str(parameters),
    )


def select_with_tie_rule(model_name: str, configurations: list[dict]) -> dict:
    best_macro = max(item["cv"]["macro_f1"]["validation_mean"] for item in configurations)
    contenders = [
        item
        for item in configurations
        if best_macro - item["cv"]["macro_f1"]["validation_mean"] <= SELECTION_TOLERANCE
    ]
    return min(
        contenders,
        key=lambda item: (
            -item["cv"]["balanced_accuracy"]["validation_mean"],
            item["cv"]["macro_f1"]["gap"],
            item["cv"]["macro_f1"]["validation_std"],
            simplicity_key(model_name, item["parameters"]),
        ),
    )


def compare_candidates(frame: pd.DataFrame) -> tuple[dict, dict, str]:
    X = frame.loc[:, REQUIRED_INPUT_COLUMNS]
    y = frame["weak_label"].astype(int)
    splits = grouped_splits(frame)
    results = {}
    selected_templates = {}
    for name, spec in candidate_specs().items():
        configurations = [
            evaluate_configuration(spec["pipeline"], parameters, X, y, splits)
            for parameters in spec["grid"]
        ]
        chosen = select_with_tie_rule(name, configurations)
        estimator = clone(spec["pipeline"]).set_params(**chosen["parameters"])
        fitted = clone(estimator).fit(X, y)
        training_prediction = fitted.predict(X)
        results[name] = {
            "deployment_eligible": spec["deployment_eligible"],
            "grid_size": len(spec["grid"]),
            "selected_parameters": chosen["parameters"],
            "cv": chosen["cv"],
            "oof_metrics": chosen["oof_metrics"],
            "full_training_metrics": metric_bundle(y, training_prediction),
        }
        selected_templates[name] = estimator

    eligible = [name for name, result in results.items() if result["deployment_eligible"]]
    best_macro = max(results[name]["cv"]["macro_f1"]["validation_mean"] for name in eligible)
    contenders = [
        name
        for name in eligible
        if best_macro - results[name]["cv"]["macro_f1"]["validation_mean"] <= SELECTION_TOLERANCE
    ]
    simpler_model = {"Linear SVM": 0, "Random Forest": 1}
    winner = min(
        contenders,
        key=lambda name: (
            -results[name]["cv"]["balanced_accuracy"]["validation_mean"],
            results[name]["cv"]["macro_f1"]["gap"],
            results[name]["cv"]["macro_f1"]["validation_std"],
            simpler_model[name],
        ),
    )
    return results, selected_templates, winner


def overfitting_assessment(result: dict) -> str:
    gap = result["cv"]["macro_f1"]["gap"]
    if result["oof_metrics"]["macro_f1"] == 1.0 and gap > 0:
        return "no OOF errors; apparent gap comes from a validation fold missing one declared class"
    if gap <= 0.02:
        return "low observed weak-CV gap"
    if gap <= 0.08:
        return "moderate observed weak-CV gap"
    return "high observed weak-CV gap"


def comparison_rows(results: dict) -> list[dict]:
    rows = []
    for name, result in results.items():
        cv = result["cv"]
        rows.append(
            {
                "model": name,
                "deployment_eligible": result["deployment_eligible"],
                "grid_size": result["grid_size"],
                "parameters": json.dumps(json_safe(result["selected_parameters"]), sort_keys=True),
                "training_accuracy": result["full_training_metrics"]["accuracy"],
                "training_macro_f1": result["full_training_metrics"]["macro_f1"],
                "cv_accuracy_mean": cv["accuracy"]["validation_mean"],
                "cv_accuracy_std": cv["accuracy"]["validation_std"],
                "cv_balanced_accuracy_mean": cv["balanced_accuracy"]["validation_mean"],
                "cv_balanced_accuracy_std": cv["balanced_accuracy"]["validation_std"],
                "cv_macro_f1_mean": cv["macro_f1"]["validation_mean"],
                "cv_macro_f1_std": cv["macro_f1"]["validation_std"],
                "cv_weighted_f1_mean": cv["weighted_f1"]["validation_mean"],
                "cv_weighted_f1_std": cv["weighted_f1"]["validation_std"],
                "cv_training_macro_f1_mean": cv["macro_f1"]["training_mean"],
                "training_validation_macro_f1_gap": cv["macro_f1"]["gap"],
                "overfitting_assessment": overfitting_assessment(result),
            }
        )
    return rows


def render_report(metrics: dict) -> str:
    lines = [
        "# Version-2 weak-supervision grouped-CV comparison",
        "",
        "> These are weak-supervision validation results, not human relevance accuracy.",
        "",
        "All tuning and selection used only 680 weak-labelled rows from 17 training profiles. The 120-row evaluation grid and reviewer workbooks were not loaded.",
        "",
        "| Model | Train acc. | Train Macro-F1 | CV acc. | CV balanced acc. | CV Macro-F1 | CV weighted-F1 | Macro-F1 gap |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in metrics["comparison"]:
        lines.append(
            f"| {row['model']} | {row['training_accuracy']:.4f} | {row['training_macro_f1']:.4f} | "
            f"{row['cv_accuracy_mean']:.4f} ± {row['cv_accuracy_std']:.4f} | "
            f"{row['cv_balanced_accuracy_mean']:.4f} ± {row['cv_balanced_accuracy_std']:.4f} | "
            f"{row['cv_macro_f1_mean']:.4f} ± {row['cv_macro_f1_std']:.4f} | "
            f"{row['cv_weighted_f1_mean']:.4f} ± {row['cv_weighted_f1_std']:.4f} | "
            f"{row['training_validation_macro_f1_gap']:.4f} |"
        )
    lines.extend(
        (
            "",
            f"Selected candidate: **{metrics['selection']['selected_model']}**.",
            "",
            "Decision Tree and Dummy are baselines only. Random Forest and Linear SVM were both eligible. Selection used grouped-CV Macro-F1; candidates within 0.01 used balanced accuracy, smaller training-validation Macro-F1 gap, lower fold variability, then simpler model.",
            "",
        )
    )
    for name, result in metrics["models"].items():
        lines.extend((f"## {name}", "", f"Parameters: `{json.dumps(json_safe(result['selected_parameters']), sort_keys=True)}`", ""))
        lines.append(f"OOF confusion matrix: `{json_safe(result['oof_metrics']['confusion_matrix'])}`")
        lines.append("")
        lines.append("Per-class out-of-fold precision / recall / F1:")
        lines.append("")
        for label, values in result["oof_metrics"]["per_class"].items():
            lines.append(
                f"- Class {label}: {values['precision']:.4f} / {values['recall']:.4f} / {values['f1']:.4f} (support {values['support']})"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=TRAIN_PATH)
    parser.add_argument("--split", type=Path, default=SPLIT_PATH)
    parser.add_argument("--artifact", type=Path, default=ARTIFACT_PATH)
    parser.add_argument("--metadata", type=Path, default=METADATA_PATH)
    parser.add_argument("--metrics", type=Path, default=METRICS_PATH)
    parser.add_argument("--comparison", type=Path, default=COMPARISON_PATH)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    frame, split, training_ids, excluded_ids = load_training_data(args.train, args.split)
    results, templates, winner = compare_candidates(frame)
    X = frame.loc[:, REQUIRED_INPUT_COLUMNS]
    y = frame["weak_label"].astype(int)
    candidate = clone(templates[winner]).fit(X, y)

    args.artifact.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(candidate, args.artifact)
    artifact_hash = sha256(args.artifact)
    rows = comparison_rows(results)
    selection_rule = (
        "Among Random Forest and Linear SVM, maximize five-fold profile-grouped weak-CV "
        "Macro-F1; within 0.01 prefer balanced accuracy, then smaller training-validation "
        "Macro-F1 gap, lower fold variability, then simpler model. Decision Tree and Dummy "
        "are baselines only."
    )
    metrics = {
        "result_scope": "weak-supervision validation, not human relevance accuracy",
        "seed": SEED,
        "cv": {"method": "StratifiedGroupKFold", "splits": CV_SPLITS, "group": "profile_id"},
        "training": {
            "rows": len(frame),
            "profiles": len(training_ids),
            "profile_ids": training_ids,
            "excluded_evaluation_profile_ids": excluded_ids,
            "class_distribution": label_distribution(y),
            "weak_rule": WEAK_RULE,
        },
        "evaluation_data_accessed": False,
        "selection": {"selected_model": winner, "tolerance": SELECTION_TOLERANCE, "rule": selection_rule},
        "comparison": rows,
        "models": results,
        "environment": {"python": sys.version.split()[0], "scikit_learn": sklearn.__version__},
    }
    metadata = {
        "model_name": "user_poi_relevance_classifier",
        "model_version": "v2_candidate",
        "artifact_status": "frozen_candidate_not_runtime_activated",
        "artifact_sha256": artifact_hash,
        "classifier": winner,
        "classes": [0, 1, 2],
        "model_parameters": json_safe(results[winner]["selected_parameters"]),
        "selection_rule": selection_rule,
        "selection_metric_scope": "weak-supervision grouped-CV; no human evaluation labels accessed",
        "training_row_count": len(frame),
        "training_profile_ids": training_ids,
        "excluded_evaluation_profile_ids": excluded_ids,
        "dataset_hashes": {
            "weak_training_csv": sha256(args.train),
            "profile_split_csv": sha256(args.split),
        },
        "feature_contract": {
            "required_prediction_inputs": list(REQUIRED_INPUT_COLUMNS),
            "feature_names": list(FEATURE_NAMES),
            "feature_count": len(FEATURE_NAMES),
            "excluded_leakage_fields": list(EXCLUDED_LEAKAGE_FIELDS),
            "threshold_features": {
                "has_any_overlap": "bounded indicator for at least one shared category",
                "all_user_interests_covered": "bounded indicator for complete interest coverage",
                "all_poi_tags_covered": "bounded indicator for complete POI-tag coverage",
                "has_multiple_overlaps": "bounded indicator for two or more shared categories",
            },
        },
        "runtime_activated": False,
        "evaluation_data_accessed": False,
    }
    args.metadata.write_text(json.dumps(json_safe(metadata), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    args.metrics.write_text(json.dumps(json_safe(metrics), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with args.comparison.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(json_safe(rows))
    args.report.write_text(render_report(json_safe(metrics)), encoding="utf-8")

    print("Weak-supervision training rows: 680")
    print("Training profiles: 17; excluded evaluation profiles: 3")
    print("Evaluation grid/workbooks accessed: no")
    for row in rows:
        print(
            f"{row['model']}: CV Macro-F1={row['cv_macro_f1_mean']:.6f} "
            f"(+/- {row['cv_macro_f1_std']:.6f}), balanced accuracy="
            f"{row['cv_balanced_accuracy_mean']:.6f}, gap={row['training_validation_macro_f1_gap']:.6f}"
        )
    print(f"Selected frozen v2 candidate: {winner}")
    print(f"Artifact SHA-256: {artifact_hash}")
    print("Runtime activation: no")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
