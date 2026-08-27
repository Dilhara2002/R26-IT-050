"""Train, compare, select, and freeze the itinerary user-POI relevance model.

Selection and tuning use only the 240 rule-derived weak-labelled training rows
with profile-group-aware cross-validation. The 60-row human-reviewed held-out
set is loaded only after the deterministic selection rule has frozen a winner.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
from xml.sax.saxutils import escape

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
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    make_scorer,
    precision_recall_fscore_support,
)
from sklearn.model_selection import (
    GridSearchCV,
    StratifiedGroupKFold,
    cross_val_predict,
    cross_validate,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.feature_extraction.text import TfidfVectorizer


AI_SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = AI_SERVICE_DIR.parents[2]
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from relevance_features import (  # noqa: E402
    EXCLUDED_LEAKAGE_FIELDS,
    REQUIRED_INPUT_COLUMNS,
    RelevancePairFeatures,
)


EVALUATION_DIR = AI_SERVICE_DIR / "data" / "evaluation"
MODELS_DIR = AI_SERVICE_DIR / "models"
TRAIN_PATH = EVALUATION_DIR / "rule_derived_weak_training_labels_v1.csv"
TEST_PATH = EVALUATION_DIR / "final_human_reviewed_heldout_60.csv"
SPLIT_PATH = EVALUATION_DIR / "frozen_profile_split_seed42.csv"
ARTIFACT_PATH = MODELS_DIR / "user_poi_relevance_v1.joblib"
METADATA_PATH = MODELS_DIR / "user_poi_relevance_v1.metadata.json"
METRICS_PATH = EVALUATION_DIR / "user_poi_relevance_metrics_v1.json"
COMPARISON_PATH = EVALUATION_DIR / "user_poi_relevance_model_comparison_v1.csv"
REPORT_PATH = EVALUATION_DIR / "user_poi_relevance_model_report_v1.md"
CV_CONFUSION_PATH = EVALUATION_DIR / "user_poi_relevance_grouped_cv_confusion_v1.svg"
TEST_CONFUSION_PATH = EVALUATION_DIR / "user_poi_relevance_heldout_confusion_v1.svg"

SEED = 42
CV_SPLITS = 4
LABELS = (0, 1, 2)
MODEL_NAME = "user_poi_relevance_classifier"
MODEL_VERSION = "v1"
WEAK_RULE = "verified_tag_interest_coverage_v1"
SELECTION_TOLERANCE = 0.005


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
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, Path):
        return str(value)
    return value


def label_distribution(values) -> dict[str, int]:
    counts = pd.Series(values).value_counts().sort_index()
    return {str(int(label)): int(counts.get(label, 0)) for label in LABELS}


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


def pipeline(classifier) -> Pipeline:
    return Pipeline(
        [
            ("features", RelevancePairFeatures()),
            ("scale", StandardScaler()),
            ("classifier", classifier),
        ]
    )


def candidate_specs() -> dict:
    return {
        "Dummy": {
            "pipeline": pipeline(DummyClassifier(strategy="most_frequent")),
            "grid": {},
            "deployment_eligible": False,
        },
        "Decision Tree": {
            "pipeline": pipeline(DecisionTreeClassifier(random_state=SEED)),
            "grid": {
                "classifier__max_depth": [2, 3, 4, None],
                "classifier__min_samples_split": [2, 10],
                "classifier__min_samples_leaf": [1, 5],
                "classifier__class_weight": [None, "balanced"],
            },
            "deployment_eligible": False,
        },
        "Random Forest": {
            "pipeline": pipeline(
                RandomForestClassifier(random_state=SEED, n_jobs=1)
            ),
            "grid": {
                "classifier__n_estimators": [100, 300],
                "classifier__max_depth": [None, 4, 8],
                "classifier__min_samples_split": [2, 10],
                "classifier__min_samples_leaf": [1, 3],
                "classifier__class_weight": [None, "balanced"],
            },
            "deployment_eligible": True,
        },
        "Linear SVM": {
            "pipeline": pipeline(
                SVC(
                    kernel="linear",
                    probability=True,
                    random_state=SEED,
                )
            ),
            "grid": {
                "classifier__C": [0.1, 1.0, 10.0],
                "classifier__class_weight": [None, "balanced"],
            },
            "deployment_eligible": True,
        },
    }


SCORING = {
    "accuracy": make_scorer(accuracy_score),
    "balanced_accuracy": make_scorer(balanced_accuracy_score),
    "macro_f1": make_scorer(
        f1_score, labels=LABELS, average="macro", zero_division=0
    ),
    "weighted_f1": make_scorer(
        f1_score, labels=LABELS, average="weighted", zero_division=0
    ),
}


def validate_training_data(frame: pd.DataFrame, split: pd.DataFrame) -> tuple[list[str], list[str]]:
    required = {
        *REQUIRED_INPUT_COLUMNS,
        "profile_id",
        "place_id",
        "weak_label",
        "rule_version",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Training data missing columns: {sorted(missing)}")
    if len(frame) != 240 or frame["profile_id"].nunique() != 12:
        raise ValueError("Training data must contain 240 rows from 12 profiles.")
    if frame[["profile_id", "place_id"]].duplicated().any():
        raise ValueError("Training data contains duplicate profile-POI pairs.")
    if not frame["weak_label"].isin(LABELS).all():
        raise ValueError("Training weak labels must be integers 0, 1, or 2.")
    if not frame["rule_version"].eq(WEAK_RULE).all():
        raise ValueError("Unexpected weak-label rule version.")
    training_ids = split.loc[split["split"] == "training", "profile_id"].tolist()
    heldout_ids = split.loc[split["split"] == "heldout", "profile_id"].tolist()
    if len(training_ids) != 12 or len(heldout_ids) != 3:
        raise ValueError("Frozen split must contain 12 training and 3 held-out profiles.")
    if set(frame["profile_id"]) != set(training_ids):
        raise ValueError("Weak training rows do not match frozen training profiles.")
    if set(frame["profile_id"]) & set(heldout_ids):
        raise ValueError("Held-out profile leakage detected in weak training data.")
    return training_ids, heldout_ids


def grouped_splits(X, y, groups):
    splitter = StratifiedGroupKFold(
        n_splits=CV_SPLITS, shuffle=True, random_state=SEED
    )
    splits = list(splitter.split(X, y, groups))
    all_groups = set(groups)
    for train_indices, validation_indices in splits:
        train_groups = set(groups.iloc[train_indices])
        validation_groups = set(groups.iloc[validation_indices])
        if train_groups & validation_groups:
            raise AssertionError("Profile leakage detected inside grouped CV.")
        if train_groups | validation_groups != all_groups:
            raise AssertionError("Grouped CV lost a training profile.")
    return splits


def compare_candidates(X, y, groups, splits) -> tuple[dict, dict]:
    results = {}
    estimators = {}
    for name, spec in candidate_specs().items():
        if spec["grid"]:
            search = GridSearchCV(
                spec["pipeline"],
                spec["grid"],
                scoring=SCORING["macro_f1"],
                cv=splits,
                refit=True,
                n_jobs=1,
                error_score="raise",
            )
            search.fit(X, y, groups=groups)
            estimator = search.best_estimator_
            parameters = search.best_params_
            grid_size = len(search.cv_results_["params"])
        else:
            estimator = clone(spec["pipeline"])
            parameters = {"classifier__strategy": "most_frequent"}
            grid_size = 1

        validation = cross_validate(
            estimator,
            X,
            y,
            groups=groups,
            cv=splits,
            scoring=SCORING,
            return_train_score=True,
            n_jobs=1,
            error_score="raise",
        )
        oof_prediction = cross_val_predict(
            estimator,
            X,
            y,
            groups=groups,
            cv=splits,
            method="predict",
            n_jobs=1,
        )
        fitted = clone(estimator).fit(X, y)
        train_prediction = fitted.predict(X)
        cv_metrics = {}
        for metric in SCORING:
            test_values = validation[f"test_{metric}"]
            train_values = validation[f"train_{metric}"]
            cv_metrics[metric] = {
                "validation_mean": np.mean(test_values),
                "validation_std": np.std(test_values),
                "training_mean": np.mean(train_values),
                "training_std": np.std(train_values),
                "gap": np.mean(train_values) - np.mean(test_values),
                "fold_validation_scores": test_values,
                "fold_training_scores": train_values,
            }
        results[name] = {
            "deployment_eligible": spec["deployment_eligible"],
            "grid_size": grid_size,
            "selected_parameters": parameters,
            "cv": cv_metrics,
            "oof_metrics": metric_bundle(y, oof_prediction),
            "full_training_metrics": metric_bundle(y, train_prediction),
            "fit_time_mean_seconds": np.mean(validation["fit_time"]),
            "fit_time_std_seconds": np.std(validation["fit_time"]),
            "prediction_time_mean_seconds": np.mean(validation["score_time"]),
            "prediction_time_std_seconds": np.std(validation["score_time"]),
        }
        estimators[name] = estimator
    return results, estimators


def select_model(results: dict) -> str:
    eligible = [name for name, result in results.items() if result["deployment_eligible"]]
    highest_macro = max(results[name]["cv"]["macro_f1"]["validation_mean"] for name in eligible)
    near_best = [
        name
        for name in eligible
        if highest_macro - results[name]["cv"]["macro_f1"]["validation_mean"]
        <= SELECTION_TOLERANCE
    ]
    near_best.sort(
        key=lambda name: (
            -results[name]["cv"]["balanced_accuracy"]["validation_mean"],
            results[name]["cv"]["macro_f1"]["validation_std"],
            name,
        )
    )
    return near_best[0]


def validate_heldout_data(frame: pd.DataFrame, heldout_ids: list[str]) -> None:
    required = {
        *REQUIRED_INPUT_COLUMNS,
        "judgement_id",
        "profile_id",
        "place_id",
        "reviewer_a_label",
        "reviewer_b_label",
        "final_relevance_label",
        "decision_type",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Held-out data missing columns: {sorted(missing)}")
    if len(frame) != 60 or frame["judgement_id"].nunique() != 60:
        raise ValueError("Held-out data must contain 60 unique judgements.")
    if frame[["profile_id", "place_id"]].duplicated().any():
        raise ValueError("Held-out data contains duplicate profile-POI pairs.")
    if set(frame["profile_id"]) != set(heldout_ids):
        raise ValueError("Held-out rows do not match the frozen held-out profiles.")
    if not frame["final_relevance_label"].isin(LABELS).all():
        raise ValueError("Held-out labels must be integers 0, 1, or 2.")


def bootstrap_intervals(y_true, y_pred, samples=1000) -> dict:
    rng = np.random.default_rng(SEED)
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    values = {"accuracy": [], "balanced_accuracy": [], "macro_f1": []}
    for _ in range(samples):
        indices = rng.integers(0, len(y_true), len(y_true))
        actual = y_true[indices]
        predicted = y_pred[indices]
        recalls = precision_recall_fscore_support(
            actual, predicted, labels=LABELS, zero_division=0
        )[1]
        values["accuracy"].append(accuracy_score(actual, predicted))
        values["balanced_accuracy"].append(float(np.mean(recalls)))
        values["macro_f1"].append(
            f1_score(actual, predicted, labels=LABELS, average="macro", zero_division=0)
        )
    return {
        metric: {
            "lower": np.percentile(metric_values, 2.5),
            "upper": np.percentile(metric_values, 97.5),
            "samples": samples,
            "seed": SEED,
            "resampling_unit": "judgement_row",
        }
        for metric, metric_values in values.items()
    }


def reproduce_old_pp1() -> dict:
    completed = subprocess.run(
        [
            "git",
            "show",
            "it22224866-frantend:backend/src/ai_service/data/places.csv",
        ],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    original = pd.read_csv(io.StringIO(completed.stdout))
    frame = original.copy()
    frame["Tags"] = frame["Tags"].fillna("General")
    frame["Rating"] = frame["Rating"].fillna(4.0)
    target = (frame["Rating"] >= 3.9).astype(int)
    vectorizer = TfidfVectorizer(
        tokenizer=lambda value: str(value).split("|"),
        token_pattern=None,
        ngram_range=(1, 3),
    )
    features = vectorizer.fit_transform(frame["Tags"])
    X_train, X_test, y_train, y_test = train_test_split(
        features, target, test_size=0.15, random_state=SEED
    )
    classifier = RandomForestClassifier(
        n_estimators=1000,
        max_features="sqrt",
        max_depth=50,
        min_samples_split=2,
        min_samples_leaf=1,
        random_state=SEED,
    )
    classifier.fit(X_train, y_train)
    prediction = classifier.predict(X_test)
    return {
        "branch": "it22224866-frantend",
        "target": "binary High_Quality = Rating >= 3.9",
        "rows": len(frame),
        "class_distribution": label_distribution(target) | {
            key: value for key, value in {}.items()
        },
        "binary_class_distribution": {
            str(label): int((target == label).sum()) for label in (0, 1)
        },
        "test_rows": len(y_test),
        "test_distribution": {
            str(label): int((y_test == label).sum()) for label in (0, 1)
        },
        "accuracy": accuracy_score(y_test, prediction),
        "weighted_f1": f1_score(y_test, prediction, average="weighted", zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, prediction, labels=(0, 1)),
        "duplicate_tag_rows": int(frame["Tags"].duplicated().sum()),
        "split_method": "random row split; not profile-group-aware",
        "interpretation": (
            "Historical imbalanced POI rating-threshold classification; not user-POI "
            "relevance and not current itinerary recommendation accuracy."
        ),
    }


def confusion_svg(matrix, title: str, path: Path) -> None:
    matrix = np.asarray(matrix, dtype=int)
    maximum = max(1, int(matrix.max()))
    width, height = 620, 500
    cell = 100
    left, top = 170, 120
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        f'<text x="{width/2}" y="38" text-anchor="middle" font-family="Arial" font-size="21" font-weight="bold">{escape(title)}</text>',
        f'<text x="{left + 1.5*cell}" y="78" text-anchor="middle" font-family="Arial" font-size="16">Predicted relevance class</text>',
        f'<text x="38" y="{top + 1.5*cell}" text-anchor="middle" font-family="Arial" font-size="16" transform="rotate(-90 38 {top + 1.5*cell})">Actual relevance class</text>',
    ]
    for index, label in enumerate(LABELS):
        parts.append(f'<text x="{left + index*cell + cell/2}" y="{top-18}" text-anchor="middle" font-family="Arial" font-size="15">{label}</text>')
        parts.append(f'<text x="{left-24}" y="{top + index*cell + cell/2 + 5}" text-anchor="middle" font-family="Arial" font-size="15">{label}</text>')
    for row in range(3):
        for column in range(3):
            value = int(matrix[row, column])
            intensity = value / maximum
            shade = int(245 - 150 * intensity)
            fill = f"rgb({shade},{shade + 5},{255})"
            x, y = left + column * cell, top + row * cell
            parts.append(f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" fill="{fill}" stroke="#17365D"/>')
            parts.append(f'<text x="{x+cell/2}" y="{y+cell/2+8}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold">{value}</text>')
    parts.append('</svg>')
    path.write_text("\n".join(parts), encoding="utf-8")


def reviewer_agreement(frame: pd.DataFrame) -> dict:
    a = frame["reviewer_a_label"].astype(int)
    b = frame["reviewer_b_label"].astype(int)
    return {
        "exact_agreement_count": int((a == b).sum()),
        "exact_agreement_percent": float((a == b).mean() * 100),
        "unweighted_kappa": cohen_kappa_score(a, b),
        "quadratic_weighted_kappa": cohen_kappa_score(a, b, weights="quadratic"),
        "joint_human_adjudications": int((frame["decision_type"] == "joint_human_adjudication").sum()),
    }


def comparison_rows(results: dict, heldout_results: dict) -> list[dict]:
    rows = []
    for name in candidate_specs():
        result = results[name]
        row = {
            "model": name,
            "deployment_eligible": result["deployment_eligible"],
            "grid_size": result["grid_size"],
            "selected_parameters": json.dumps(json_safe(result["selected_parameters"]), sort_keys=True),
            "cv_accuracy_mean": result["cv"]["accuracy"]["validation_mean"],
            "cv_accuracy_std": result["cv"]["accuracy"]["validation_std"],
            "cv_balanced_accuracy_mean": result["cv"]["balanced_accuracy"]["validation_mean"],
            "cv_balanced_accuracy_std": result["cv"]["balanced_accuracy"]["validation_std"],
            "cv_macro_f1_mean": result["cv"]["macro_f1"]["validation_mean"],
            "cv_macro_f1_std": result["cv"]["macro_f1"]["validation_std"],
            "cv_weighted_f1_mean": result["cv"]["weighted_f1"]["validation_mean"],
            "cv_weighted_f1_std": result["cv"]["weighted_f1"]["validation_std"],
            "cv_training_macro_f1_mean": result["cv"]["macro_f1"]["training_mean"],
            "training_validation_macro_f1_gap": result["cv"]["macro_f1"]["gap"],
            "fit_time_mean_seconds": result["fit_time_mean_seconds"],
            "prediction_time_mean_seconds": result["prediction_time_mean_seconds"],
            "heldout_accuracy": heldout_results[name]["accuracy"],
            "heldout_balanced_accuracy": heldout_results[name]["balanced_accuracy"],
            "heldout_macro_f1": heldout_results[name]["macro_f1"],
            "heldout_weighted_f1": heldout_results[name]["weighted_f1"],
        }
        rows.append(row)
    return rows


def report_markdown(metrics: dict, rows: list[dict]) -> str:
    selected = metrics["selection"]["selected_model"]
    heldout = metrics["heldout_evaluation"]["models"][selected]
    lines = [
        "# Itinerary User–POI Relevance Classifier v1",
        "",
        "## Executive verdict",
        "",
        f"The frozen deployment candidate is **{selected}**, selected only from grouped weak-label training validation. Training used rule-derived weak supervision; final evaluation used a separately human-reviewed, profile-held-out 60-row test set.",
        "",
        "## Dataset and reviewer evidence",
        "",
        f"- Weak-labelled training set: 240 pairs, 12 profiles, distribution `{metrics['datasets']['training']['class_distribution']}`.",
        f"- Human-reviewed held-out set: 60 pairs, 3 profiles, distribution `{metrics['datasets']['heldout']['class_distribution']}`.",
        f"- Reviewer agreement: {metrics['reviewer_agreement']['exact_agreement_count']}/60 ({metrics['reviewer_agreement']['exact_agreement_percent']:.2f}%), unweighted κ {metrics['reviewer_agreement']['unweighted_kappa']:.6f}, quadratic κ {metrics['reviewer_agreement']['quadratic_weighted_kappa']:.6f}.",
        "",
        "## Leakage controls and features",
        "",
        f"Only `{list(REQUIRED_INPUT_COLUMNS)}` enter the pipeline. Excluded leakage/identity fields: `{list(EXCLUDED_LEAKAGE_FIELDS)}`. Profiles are separated with 4-fold `StratifiedGroupKFold`; preprocessors are inside each sklearn pipeline.",
        "",
        "The transparent features are fixed per-category user flags, verified-POI tag flags, per-category user/tag interactions, user-interest count, and POI-tag count. Precomputed `overlap_set` and `interest_coverage` are deliberately excluded. Interaction features are scientifically justified because the target construct is pair relevance, but their close relationship to the deterministic weak-label rule can make weak-label CV optimistic.",
        "",
        "## Model comparison",
        "",
        "| Model | CV Macro-F1 mean ± SD | CV balanced accuracy | Train Macro-F1 | Gap | Held-out Macro-F1 | Held-out balanced accuracy |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(
            f"| {row['model']} | {row['cv_macro_f1_mean']:.4f} ± {row['cv_macro_f1_std']:.4f} | {row['cv_balanced_accuracy_mean']:.4f} | {row['cv_training_macro_f1_mean']:.4f} | {row['training_validation_macro_f1_gap']:.4f} | {row['heldout_macro_f1']:.4f} | {row['heldout_balanced_accuracy']:.4f} |"
        )
    lines.extend(
        [
            "",
            "The Decision Tree and Dummy models are baselines only. The frozen rule selects among Random Forest and Linear SVM by grouped-CV Macro-F1; candidates within 0.005 use balanced accuracy, then lower Macro-F1 variability, then model name.",
            "",
            "## Selected-model held-out evaluation",
            "",
            f"- Accuracy: **{heldout['accuracy']:.4f}**",
            f"- Balanced accuracy: **{heldout['balanced_accuracy']:.4f}**",
            f"- Macro-F1: **{heldout['macro_f1']:.4f}**",
            f"- Weighted-F1: **{heldout['weighted_f1']:.4f}**",
            f"- Actual distribution: `{heldout['actual_distribution']}`",
            f"- Predicted distribution: `{heldout['predicted_distribution']}`",
            f"- Confusion matrix: `{heldout['confusion_matrix']}`",
            f"- Misclassified judgement IDs: `{metrics['heldout_evaluation']['selected_model_misclassified_judgement_ids']}`",
            "",
            "This accuracy is precisely the fraction of 60 human-reviewed user-profile–POI relevance classes correctly classified for three frozen Kandy preference profiles. It is not end-to-end itinerary quality, user satisfaction, route optimality, or nationwide recommendation accuracy.",
            "",
            "## Old PP1 distinction",
            "",
            f"The old branch predicted `{metrics['old_pp1']['target']}` from tags. Its reproduced test accuracy was {metrics['old_pp1']['accuracy']:.2%}, with class distribution `{metrics['old_pp1']['binary_class_distribution']}` and confusion matrix `{metrics['old_pp1']['confusion_matrix']}`. It missed every negative in that split and is not the deployed relevance task.",
            "",
            "## Overfitting and limitations",
            "",
            "- Weak-label CV measures reproduction/generalisation of rule-derived supervision across training profiles, not agreement with independent human preferences.",
            "- The training feature interactions are close to the weak rule’s semantic construct, so very high weak-label CV is expected and must not be presented as real-user performance.",
            "- The final set contains only 60 judgements from three held-out profiles over the same 20-POI catalogue; confidence intervals are wide and generalisability is limited.",
            "- POI tags are verified, but the interest ontology and Kandy-only catalogue are narrow.",
            "- Model probability/decision outputs are classification scores, not calibrated user-satisfaction probabilities.",
            "- The relevance classifier gates candidates only; deterministic 70/30 ranking, time feasibility, and the seeded GA remain separate stages.",
            "",
            "## Reproducibility",
            "",
            "```powershell",
            r"backend\.venv\Scripts\python.exe -B backend\src\ai_service\scripts\train_relevance_model.py",
            "```",
            "",
            f"Seed: `{SEED}`. scikit-learn: `{sklearn.__version__}`. Dataset hashes are recorded in the metadata and metrics JSON.",
        ]
    )
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=Path, default=TRAIN_PATH)
    parser.add_argument("--test", type=Path, default=TEST_PATH)
    parser.add_argument("--split", type=Path, default=SPLIT_PATH)
    parser.add_argument("--artifact", type=Path, default=ARTIFACT_PATH)
    parser.add_argument("--metadata", type=Path, default=METADATA_PATH)
    parser.add_argument("--metrics", type=Path, default=METRICS_PATH)
    parser.add_argument("--comparison", type=Path, default=COMPARISON_PATH)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument("--cv-confusion", type=Path, default=CV_CONFUSION_PATH)
    parser.add_argument("--test-confusion", type=Path, default=TEST_CONFUSION_PATH)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    train = pd.read_csv(args.train)
    split = pd.read_csv(args.split)
    training_ids, heldout_ids = validate_training_data(train, split)
    X_train = train.loc[:, REQUIRED_INPUT_COLUMNS]
    y_train = train["weak_label"].astype(int)
    groups = train["profile_id"].astype(str)
    splits = grouped_splits(X_train, y_train, groups)

    comparison, tuned_estimators = compare_candidates(
        X_train, y_train, groups, splits
    )
    selected_name = select_model(comparison)
    selection_snapshot = {
        name: {
            "cv_macro_f1_mean": comparison[name]["cv"]["macro_f1"]["validation_mean"],
            "cv_balanced_accuracy_mean": comparison[name]["cv"]["balanced_accuracy"]["validation_mean"],
            "cv_macro_f1_std": comparison[name]["cv"]["macro_f1"]["validation_std"],
        }
        for name in ("Random Forest", "Linear SVM")
    }

    # The held-out labels are intentionally loaded only after selection is frozen.
    heldout = pd.read_csv(args.test)
    validate_heldout_data(heldout, heldout_ids)
    X_test = heldout.loc[:, REQUIRED_INPUT_COLUMNS]
    y_test = heldout["final_relevance_label"].astype(int)

    heldout_results = {}
    fitted_candidates = {}
    selected_prediction = None
    for name, estimator in tuned_estimators.items():
        fitted = clone(estimator).fit(X_train, y_train)
        prediction = fitted.predict(X_test)
        heldout_results[name] = metric_bundle(y_test, prediction)
        fitted_candidates[name] = fitted
        if name == selected_name:
            selected_prediction = prediction

    # Explicit post-selection full-training fit for the frozen deployment artifact.
    selected_pipeline = clone(tuned_estimators[selected_name]).fit(X_train, y_train)
    selected_prediction = selected_pipeline.predict(X_test)
    heldout_results[selected_name] = metric_bundle(y_test, selected_prediction)
    bootstrap = bootstrap_intervals(y_test.to_numpy(), selected_prediction)
    misclassified = heldout.loc[
        y_test.to_numpy() != selected_prediction, "judgement_id"
    ].tolist()

    old_pp1 = reproduce_old_pp1()
    reviewer = reviewer_agreement(heldout)
    feature_names = selected_pipeline.named_steps["features"].get_feature_names_out().tolist()
    creation_time = datetime.now(timezone.utc).isoformat()
    metrics = {
        "schema_version": "1.0",
        "created_at_utc": creation_time,
        "seed": SEED,
        "runtime_role": "user_profile_poi_relevance_gate_before_deterministic_ranking_and_ga",
        "datasets": {
            "training": {
                "path": str(args.train.resolve()),
                "sha256": sha256(args.train),
                "rows": len(train),
                "profiles": training_ids,
                "class_distribution": label_distribution(y_train),
                "supervision": "rule-derived weak training labels",
                "weak_label_rule": WEAK_RULE,
            },
            "heldout": {
                "path": str(args.test.resolve()),
                "sha256": sha256(args.test),
                "rows": len(heldout),
                "profiles": heldout_ids,
                "class_distribution": label_distribution(y_test),
                "supervision": "separately human-reviewed and jointly adjudicated",
                "use": "single final evaluation only; never selection or tuning",
            },
            "split_sha256": sha256(args.split),
        },
        "features": {
            "raw_input_columns": list(REQUIRED_INPUT_COLUMNS),
            "transformed_feature_names": feature_names,
            "excluded_leakage_fields": list(EXCLUDED_LEAKAGE_FIELDS),
            "justification": (
                "Per-category interest/tag interactions represent the target construct "
                "without ingesting precomputed overlap_set or interest_coverage."
            ),
        },
        "cv": {
            "method": "StratifiedGroupKFold",
            "splits": CV_SPLITS,
            "group": "profile_id (split-only; never a model feature)",
            "profile_overlap_per_fold": 0,
        },
        "model_comparison": comparison,
        "selection": {
            "selected_model": selected_name,
            "selected_parameters": comparison[selected_name]["selected_parameters"],
            "rule": (
                "Among Random Forest and Linear SVM, maximize grouped-CV Macro-F1; "
                "within 0.005 use balanced accuracy, then lower Macro-F1 SD, then model name."
            ),
            "training_only_snapshot": selection_snapshot,
            "heldout_used_for_selection": False,
        },
        "heldout_evaluation": {
            "models": heldout_results,
            "selected_model": selected_name,
            "selected_model_bootstrap_95_percent_ci": bootstrap,
            "selected_model_misclassified_judgement_ids": misclassified,
            "limitations": (
                "Only 60 judgements from three held-out profiles over the same 20 Kandy POIs; "
                "row bootstrap does not capture additional profile-level uncertainty."
            ),
        },
        "reviewer_agreement": reviewer,
        "old_pp1": old_pp1,
    }

    metadata = {
        "schema_version": "1.0",
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "classifier": selected_name,
        "created_at_utc": creation_time,
        "sklearn_version": sklearn.__version__,
        "python_version": sys.version,
        "raw_feature_schema": list(REQUIRED_INPUT_COLUMNS),
        "transformed_feature_names": feature_names,
        "excluded_leakage_fields": list(EXCLUDED_LEAKAGE_FIELDS),
        "weak_label_rule": WEAK_RULE,
        "training_profile_ids": training_ids,
        "heldout_profile_ids": heldout_ids,
        "cv_method": "4-fold StratifiedGroupKFold by profile_id",
        "selected_parameters": comparison[selected_name]["selected_parameters"],
        "selection_rule": metrics["selection"]["rule"],
        "training_cv_metrics": comparison[selected_name]["cv"],
        "heldout_metrics": heldout_results[selected_name],
        "dataset_hashes": {
            "weak_training_csv": sha256(args.train),
            "human_heldout_csv": sha256(args.test),
            "frozen_split_csv": sha256(args.split),
        },
        "runtime_role": metrics["runtime_role"],
        "classes": list(LABELS),
        "limitations": [
            "Training supervision is deterministic and weak, not human ground truth.",
            "Held-out evidence contains 60 rows from only three profiles.",
            "The catalogue is limited to 20 verified Kandy POIs.",
            "Classification probabilities are not calibrated user-satisfaction probabilities.",
            "The model gates relevance only; it does not rank proximity or optimize routes.",
        ],
    }

    for path in (
        args.artifact,
        args.metadata,
        args.metrics,
        args.comparison,
        args.report,
        args.cv_confusion,
        args.test_confusion,
    ):
        path.parent.mkdir(parents=True, exist_ok=True)

    joblib.dump(selected_pipeline, args.artifact)
    args.metadata.write_text(
        json.dumps(json_safe(metadata), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    args.metrics.write_text(
        json.dumps(json_safe(metrics), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    rows = comparison_rows(comparison, heldout_results)
    with args.comparison.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(json_safe(rows))
    args.report.write_text(report_markdown(json_safe(metrics), rows), encoding="utf-8")
    confusion_svg(
        comparison[selected_name]["oof_metrics"]["confusion_matrix"],
        f"{selected_name} grouped-CV out-of-fold confusion matrix",
        args.cv_confusion,
    )
    confusion_svg(
        heldout_results[selected_name]["confusion_matrix"],
        f"{selected_name} human-held-out confusion matrix",
        args.test_confusion,
    )

    artifact_hash = sha256(args.artifact)
    metadata["artifact_sha256"] = artifact_hash
    args.metadata.write_text(
        json.dumps(json_safe(metadata), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(json_safe({
        "selected_model": selected_name,
        "selected_parameters": comparison[selected_name]["selected_parameters"],
        "training_distribution": label_distribution(y_train),
        "heldout_distribution": label_distribution(y_test),
        "selected_cv": comparison[selected_name]["cv"],
        "selected_heldout": heldout_results[selected_name],
        "bootstrap_95_percent_ci": bootstrap,
        "misclassified_judgement_ids": misclassified,
        "artifact": str(args.artifact.resolve()),
        "artifact_sha256": artifact_hash,
    }), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
