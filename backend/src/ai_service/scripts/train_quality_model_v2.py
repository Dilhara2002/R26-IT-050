"""Train and evaluate a leakage-safe quality-model candidate.

The script creates one stratified holdout before model selection. All TF-IDF
fitting and hyperparameter selection happen inside cross-validation folds on
the training partition; the holdout is evaluated exactly once after selection.
"""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    make_scorer,
    precision_score,
    recall_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC


RANDOM_STATE = 42
TEST_SIZE = 0.20
N_SPLITS = 5
QUALITY_THRESHOLD = 3.9
MINORITY_CLASS = 0
DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "places.csv"
MODELS_DIRECTORY = Path(__file__).resolve().parents[1] / "models"
MODEL_PATH = MODELS_DIRECTORY / "quality_model_v2_candidate.joblib"
METADATA_PATH = MODELS_DIRECTORY / "quality_model_v2_candidate.metadata.json"


def pipe_tag_tokenizer(value: str) -> list[str]:
    """Split the pipe-delimited Tags field using a serializable function."""
    return str(value).split("|")


# A script launched by filename is named ``__main__``. Give the tokenizer a
# stable, importable identity so a pipeline saved from that invocation can be
# loaded by joblib in a fresh Python process.
STABLE_MODULE_NAME = "backend.src.ai_service.scripts.train_quality_model_v2"
if __name__ == "__main__":
    repository_root = str(Path(__file__).resolve().parents[4])
    if repository_root not in sys.path:
        sys.path.insert(0, repository_root)
    sys.modules[STABLE_MODULE_NAME] = sys.modules[__name__]
    pipe_tag_tokenizer.__module__ = STABLE_MODULE_NAME


def make_pipeline(classifier: object) -> Pipeline:
    """Create a pipeline whose vectorizer is fitted inside each training fold."""
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    tokenizer=pipe_tag_tokenizer,
                    token_pattern=None,
                    ngram_range=(1, 3),
                ),
            ),
            ("classifier", classifier),
        ]
    )


def json_safe(value: Any) -> Any:
    """Convert NumPy and estimator values into strict JSON-compatible values."""
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return [json_safe(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return value.item()
    return value


def calculate_metrics(expected: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    """Calculate imbalance-aware binary classification metrics."""
    return {
        "accuracy": float(accuracy_score(expected, predicted)),
        "balanced_accuracy": float(balanced_accuracy_score(expected, predicted)),
        "macro_f1": float(
            f1_score(expected, predicted, average="macro", zero_division=0)
        ),
        "minority_precision": float(
            precision_score(
                expected,
                predicted,
                pos_label=MINORITY_CLASS,
                zero_division=0,
            )
        ),
        "minority_recall": float(
            recall_score(
                expected,
                predicted,
                pos_label=MINORITY_CLASS,
                zero_division=0,
            )
        ),
    }


def format_metrics(metrics: dict[str, float]) -> str:
    """Format a metric mapping in a stable order."""
    return ", ".join(f"{name}={value:.4f}" for name, value in metrics.items())


def candidate_cv_results(search: GridSearchCV) -> list[dict[str, Any]]:
    """Extract every evaluated configuration and its five-fold test metrics."""
    results: list[dict[str, Any]] = []
    metric_names = (
        "accuracy",
        "balanced_accuracy",
        "macro_f1",
        "minority_precision",
        "minority_recall",
    )
    for index, parameters in enumerate(search.cv_results_["params"]):
        metrics = {
            metric: {
                "mean": float(search.cv_results_[f"mean_test_{metric}"][index]),
                "std": float(search.cv_results_[f"std_test_{metric}"][index]),
            }
            for metric in metric_names
        }
        results.append(
            {
                "rank_macro_f1": int(
                    search.cv_results_["rank_test_macro_f1"][index]
                ),
                "parameters": json_safe(parameters),
                "metrics": metrics,
            }
        )
    return results


def print_cv_results(name: str, results: list[dict[str, Any]]) -> None:
    """Print all parameter configurations, not only each search winner."""
    print(f"\n{name} cross-validation results (training partition only)")
    for index, result in enumerate(results, start=1):
        metric_text = ", ".join(
            f"{metric}={values['mean']:.4f} +/- {values['std']:.4f}"
            for metric, values in result["metrics"].items()
        )
        print(
            f"  config {index:02d} | Macro-F1 rank={result['rank_macro_f1']} "
            f"| params={json.dumps(result['parameters'], sort_keys=True)} "
            f"| {metric_text}"
        )


def main() -> int:
    dataset_sha256 = hashlib.sha256(DATASET_PATH.read_bytes()).hexdigest()
    data = pd.read_csv(DATASET_PATH)
    required_columns = {"Tags", "Rating"}
    missing_columns = required_columns.difference(data.columns)
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing_columns)}")

    features = data["Tags"].fillna("General").astype(str)
    ratings = pd.to_numeric(data["Rating"], errors="coerce").fillna(4.0)
    labels = (ratings >= QUALITY_THRESHOLD).astype(int)
    class_counts = Counter(int(value) for value in labels)

    # This is the only outer split. The test values are held aside until the
    # globally selected training-CV winner has been fixed.
    train_features, test_features, train_labels, test_labels = train_test_split(
        features,
        labels,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    train_counts = Counter(int(value) for value in train_labels)
    test_counts = Counter(int(value) for value in test_labels)

    parameter_grids: dict[str, dict[str, list[Any]]] = {
        "Logistic Regression": {
            "classifier__C": [0.1, 1.0, 10.0],
        },
        "LinearSVC": {
            "classifier__C": [0.1, 1.0, 10.0],
        },
        "Random Forest": {
            "classifier__n_estimators": [100, 300, 500],
            "classifier__max_depth": [None, 30],
            "classifier__class_weight": ["balanced", "balanced_subsample"],
        },
    }
    candidates = {
        "Logistic Regression": LogisticRegression(
            class_weight="balanced",
            max_iter=2000,
            random_state=RANDOM_STATE,
        ),
        "LinearSVC": LinearSVC(
            class_weight="balanced",
            max_iter=5000,
            random_state=RANDOM_STATE,
        ),
        "Random Forest": RandomForestClassifier(
            min_samples_leaf=1,
            max_features="sqrt",
            n_jobs=1,
            random_state=RANDOM_STATE,
        ),
    }
    scoring = {
        "accuracy": "accuracy",
        "balanced_accuracy": "balanced_accuracy",
        "macro_f1": make_scorer(f1_score, average="macro", zero_division=0),
        "minority_precision": make_scorer(
            precision_score,
            pos_label=MINORITY_CLASS,
            zero_division=0,
        ),
        "minority_recall": make_scorer(
            recall_score,
            pos_label=MINORITY_CLASS,
            zero_division=0,
        ),
    }
    folds = StratifiedKFold(
        n_splits=N_SPLITS,
        shuffle=True,
        random_state=RANDOM_STATE,
    )

    print("QUALITY MODEL V2 CANDIDATE TRAINING")
    print(f"Dataset: {DATASET_PATH}")
    print(f"Dataset SHA-256: {dataset_sha256}")
    print(f"Dataset row count: {len(data)}")
    print(f"Label definition: Rating >= {QUALITY_THRESHOLD}")
    print(f"Class counts: {dict(sorted(class_counts.items()))}")
    print(
        f"Train count: {len(train_features)}; class counts: "
        f"{dict(sorted(train_counts.items()))}"
    )
    print(
        f"Untouched test count: {len(test_features)}; class counts: "
        f"{dict(sorted(test_counts.items()))}"
    )
    print(
        "Outer split: train_test_split(test_size=0.20, random_state=42, "
        "stratify=label)"
    )
    print(
        "Model selection: StratifiedKFold(n_splits=5, shuffle=True, "
        "random_state=42), training partition only"
    )
    print("Primary selection metric: Macro F1")
    print(
        "Leakage control: Pipeline fits TfidfVectorizer independently inside "
        "each training fold; untouched test data is excluded from all tuning."
    )
    print("Fixed TF-IDF settings: tokenizer=pipe_tag_tokenizer, ngram_range=(1, 3)")
    print("Parameter grids:")
    for name, grid in parameter_grids.items():
        print(f"  {name}: {json.dumps(json_safe(grid), sort_keys=True)}")

    searches: dict[str, GridSearchCV] = {}
    all_cv_results: dict[str, list[dict[str, Any]]] = {}
    for name, classifier in candidates.items():
        search = GridSearchCV(
            estimator=make_pipeline(classifier),
            param_grid=parameter_grids[name],
            scoring=scoring,
            refit="macro_f1",
            cv=folds,
            n_jobs=1,
            return_train_score=False,
            error_score="raise",
        )
        search.fit(train_features, train_labels)
        searches[name] = search
        all_cv_results[name] = candidate_cv_results(search)
        print_cv_results(name, all_cv_results[name])

    # The holdout is still untouched here. Resolve the winner strictly from CV;
    # Balanced Accuracy is used only to make an exact Macro-F1 tie deterministic.
    def selection_key(name: str) -> tuple[float, float, str]:
        search = searches[name]
        index = search.best_index_
        return (
            float(search.cv_results_["mean_test_macro_f1"][index]),
            float(search.cv_results_["mean_test_balanced_accuracy"][index]),
            name,
        )

    selected_name = max(searches, key=selection_key)
    selected_search = searches[selected_name]
    selected_index = selected_search.best_index_
    selected_parameters = json_safe(selected_search.best_params_)
    selected_cv_metrics = all_cv_results[selected_name][selected_index]["metrics"]
    selected_pipeline = selected_search.best_estimator_

    print("\nSELECTED BY TRAINING CROSS-VALIDATION ONLY")
    print(f"Selected model: {selected_name}")
    print(f"Selected hyperparameters: {json.dumps(selected_parameters, sort_keys=True)}")
    print(
        "Selected CV metrics: "
        + ", ".join(
            f"{metric}={values['mean']:.4f} +/- {values['std']:.4f}"
            for metric, values in selected_cv_metrics.items()
        )
    )

    # First and only selected-model prediction against the untouched test set.
    selected_test_predictions = selected_pipeline.predict(test_features)
    selected_test_metrics = calculate_metrics(test_labels, selected_test_predictions)
    selected_confusion_matrix = confusion_matrix(
        test_labels,
        selected_test_predictions,
        labels=[MINORITY_CLASS, 1],
    )

    dummy = DummyClassifier(strategy="most_frequent")
    dummy_train_features = np.zeros((len(train_labels), 1), dtype=np.uint8)
    dummy_test_features = np.zeros((len(test_labels), 1), dtype=np.uint8)
    dummy.fit(dummy_train_features, train_labels)
    dummy_test_predictions = dummy.predict(dummy_test_features)
    dummy_test_metrics = calculate_metrics(test_labels, dummy_test_predictions)
    dummy_confusion_matrix = confusion_matrix(
        test_labels,
        dummy_test_predictions,
        labels=[MINORITY_CLASS, 1],
    )

    print("\nUNTOUCHED TEST RESULTS (evaluated once after selection)")
    print(f"Selected model metrics: {format_metrics(selected_test_metrics)}")
    print(
        "Selected model confusion matrix (rows actual [0, 1], columns predicted "
        f"[0, 1]): {selected_confusion_matrix.tolist()}"
    )
    print(f"Dummy baseline metrics: {format_metrics(dummy_test_metrics)}")
    print(
        "Dummy confusion matrix (rows actual [0, 1], columns predicted [0, 1]): "
        f"{dummy_confusion_matrix.tolist()}"
    )

    safety_gates = {
        "balanced_accuracy_exceeds_0.50": {
            "passed": selected_test_metrics["balanced_accuracy"] > 0.50,
            "value": selected_test_metrics["balanced_accuracy"],
            "threshold": 0.50,
            "comparison": ">",
        },
        "macro_f1_exceeds_dummy_macro_f1": {
            "passed": selected_test_metrics["macro_f1"]
            > dummy_test_metrics["macro_f1"],
            "value": selected_test_metrics["macro_f1"],
            "threshold": dummy_test_metrics["macro_f1"],
            "comparison": ">",
        },
        "minority_recall_greater_than_zero": {
            "passed": selected_test_metrics["minority_recall"] > 0.0,
            "value": selected_test_metrics["minority_recall"],
            "threshold": 0.0,
            "comparison": ">",
        },
    }
    all_gates_passed = all(gate["passed"] for gate in safety_gates.values())

    print("\nDEPLOYMENT SAFETY GATES")
    for gate_name, gate in safety_gates.items():
        outcome = "PASS" if gate["passed"] else "FAIL"
        print(
            f"  {outcome}: {gate_name} "
            f"({gate['value']:.4f} {gate['comparison']} {gate['threshold']:.4f})"
        )

    if not all_gates_passed:
        print("NOT READY FOR RUNTIME")
        print("No model artifact or metadata was saved.")
        return 0

    metadata = {
        "artifact_status": "candidate_not_automatically_production_ready",
        "dataset": {
            "path": str(DATASET_PATH),
            "sha256": dataset_sha256,
            "row_count": len(data),
            "class_counts": dict(sorted(class_counts.items())),
        },
        "label_definition": f"Rating >= {QUALITY_THRESHOLD}",
        "split_settings": {
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "stratify": "quality label",
            "train_count": len(train_features),
            "test_count": len(test_features),
            "train_class_counts": dict(sorted(train_counts.items())),
            "test_class_counts": dict(sorted(test_counts.items())),
            "cross_validation": {
                "type": "StratifiedKFold",
                "n_splits": N_SPLITS,
                "shuffle": True,
                "random_state": RANDOM_STATE,
            },
        },
        "sklearn_version": sklearn.__version__,
        "selection_metric": "macro_f1",
        "selected_model": selected_name,
        "selected_parameters": selected_parameters,
        "parameter_grids": json_safe(parameter_grids),
        "cv_metrics": all_cv_results,
        "selected_cv_metrics": selected_cv_metrics,
        "untouched_test_metrics": selected_test_metrics,
        "untouched_test_confusion_matrix_labels": [MINORITY_CLASS, 1],
        "untouched_test_confusion_matrix": selected_confusion_matrix.tolist(),
        "dummy_test_metrics": dummy_test_metrics,
        "dummy_test_confusion_matrix": dummy_confusion_matrix.tolist(),
        "safety_gates": safety_gates,
        "all_safety_gates_passed": all_gates_passed,
        "runtime_integration": False,
    }

    MODELS_DIRECTORY.mkdir(parents=True, exist_ok=True)
    joblib.dump(selected_pipeline, MODEL_PATH)
    with METADATA_PATH.open("w", encoding="utf-8") as metadata_file:
        json.dump(json_safe(metadata), metadata_file, indent=2, sort_keys=True)
        metadata_file.write("\n")

    print("MINIMUM SAFETY GATES PASSED")
    print("CANDIDATE ONLY - NOT AUTOMATICALLY PRODUCTION-READY")
    print(f"Saved candidate pipeline: {MODEL_PATH}")
    print(f"Saved provenance metadata: {METADATA_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
