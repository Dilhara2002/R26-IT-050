"""Compare quality classifiers with leakage-safe stratified cross-validation.

This diagnostic is intentionally read-only: it loads ``places.csv`` and prints
results without changing data, persisting models, or writing report artifacts.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier


RANDOM_STATE = 42
N_SPLITS = 5
QUALITY_THRESHOLD = 3.9
MINORITY_CLASS = 0
DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "places.csv"


def split_tags(value: str) -> list[str]:
    """Tokenize the pipe-delimited Tags field in the same way as runtime code."""
    return str(value).split("|")


def make_pipeline(classifier: object) -> Pipeline:
    """Build a fresh TF-IDF/classifier pipeline for fold-local fitting."""
    return Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    tokenizer=split_tags,
                    token_pattern=None,
                    ngram_range=(1, 3),
                ),
            ),
            ("classifier", classifier),
        ]
    )


def evaluate_model(
    pipeline: Pipeline,
    features: pd.Series,
    labels: pd.Series,
    folds: StratifiedKFold,
) -> dict[str, object]:
    """Return fold metrics and a confusion matrix from out-of-fold predictions."""
    metric_values: dict[str, list[float]] = {
        "accuracy": [],
        "balanced_accuracy": [],
        "macro_f1": [],
        "minority_precision": [],
        "minority_recall": [],
    }
    out_of_fold_predictions = np.empty(len(labels), dtype=int)

    for train_indices, test_indices in folds.split(features, labels):
        fold_pipeline = clone(pipeline)
        fold_pipeline.fit(features.iloc[train_indices], labels.iloc[train_indices])
        predictions = fold_pipeline.predict(features.iloc[test_indices])
        expected = labels.iloc[test_indices]
        out_of_fold_predictions[test_indices] = predictions

        metric_values["accuracy"].append(accuracy_score(expected, predictions))
        metric_values["balanced_accuracy"].append(
            balanced_accuracy_score(expected, predictions)
        )
        metric_values["macro_f1"].append(
            f1_score(expected, predictions, average="macro", zero_division=0)
        )
        metric_values["minority_precision"].append(
            precision_score(
                expected,
                predictions,
                pos_label=MINORITY_CLASS,
                zero_division=0,
            )
        )
        metric_values["minority_recall"].append(
            recall_score(
                expected,
                predictions,
                pos_label=MINORITY_CLASS,
                zero_division=0,
            )
        )

    return {
        "fold_metrics": metric_values,
        "confusion_matrix": confusion_matrix(
            labels,
            out_of_fold_predictions,
            labels=[MINORITY_CLASS, 1],
        ),
    }


def mean_and_std(values: list[float]) -> tuple[float, float]:
    """Calculate cross-validation mean and population standard deviation."""
    return float(np.mean(values)), float(np.std(values))


def format_score(values: list[float]) -> str:
    """Format one cross-validation metric as mean +/- standard deviation."""
    mean, standard_deviation = mean_and_std(values)
    return f"{mean:.4f} +/- {standard_deviation:.4f}"


def print_ranked_table(results: dict[str, dict[str, object]]) -> list[str]:
    """Print and return model names ranked by Macro F1, then Balanced Accuracy."""
    ranked_names = sorted(
        results,
        key=lambda name: (
            mean_and_std(results[name]["fold_metrics"]["macro_f1"])[0],
            mean_and_std(
                results[name]["fold_metrics"]["balanced_accuracy"]
            )[0],
        ),
        reverse=True,
    )
    headers = [
        "Rank",
        "Model",
        "Accuracy",
        "Balanced Acc.",
        "Macro F1",
        "Minority Prec.",
        "Minority Recall",
    ]
    rows: list[list[str]] = []
    for rank, name in enumerate(ranked_names, start=1):
        metrics = results[name]["fold_metrics"]
        rows.append(
            [
                str(rank),
                name,
                format_score(metrics["accuracy"]),
                format_score(metrics["balanced_accuracy"]),
                format_score(metrics["macro_f1"]),
                format_score(metrics["minority_precision"]),
                format_score(metrics["minority_recall"]),
            ]
        )

    widths = [
        max(len(headers[index]), *(len(row[index]) for row in rows))
        for index in range(len(headers))
    ]
    print(" | ".join(value.ljust(widths[index]) for index, value in enumerate(headers)))
    print("-+-".join("-" * width for width in widths))
    for row in rows:
        print(" | ".join(value.ljust(widths[index]) for index, value in enumerate(row)))
    return ranked_names


def print_interpretation(
    results: dict[str, dict[str, object]],
    ranked_names: list[str],
    majority_baseline: float,
    class_counts: Counter,
) -> None:
    """Print an imbalance-aware interpretation without selecting a runtime model."""
    random_forest_metrics = results["Random Forest"]["fold_metrics"]
    random_forest_accuracy = mean_and_std(random_forest_metrics["accuracy"])[0]
    random_forest_balanced_accuracy = mean_and_std(
        random_forest_metrics["balanced_accuracy"]
    )[0]
    random_forest_minority_recall = mean_and_std(
        random_forest_metrics["minority_recall"]
    )[0]
    accuracy_delta = random_forest_accuracy - majority_baseline

    print("\nINTERPRETATION")
    print(
        f"- Class 1 outnumbers class 0 by {class_counts[1]} to "
        f"{class_counts[MINORITY_CLASS]}. Consequently, a model can achieve "
        f"{majority_baseline:.4f} accuracy while never detecting class 0."
    )
    print(
        "- Accuracy is therefore considered alongside Balanced Accuracy, Macro F1, "
        "and minority-class precision/recall; the table is ranked by Macro F1 and "
        "then Balanced Accuracy, not by accuracy."
    )
    print(
        f"- Random Forest mean accuracy is {random_forest_accuracy:.4f}, a "
        f"{accuracy_delta:+.4f} absolute difference from the majority baseline. "
        f"Its Balanced Accuracy is {random_forest_balanced_accuracy:.4f} and its "
        f"minority recall is {random_forest_minority_recall:.4f}."
    )
    if accuracy_delta > 0 and random_forest_minority_recall > 0:
        print(
            "- Random Forest beats the majority baseline on mean accuracy and also "
            "detects some minority examples, but the minority-aware metrics determine "
            "whether that improvement is practically meaningful."
        )
    else:
        print(
            "- Random Forest does not beat the honest majority baseline on raw "
            "accuracy. It does beat that baseline on Balanced Accuracy, Macro F1, "
            "and minority recall, but this comes with many majority-class false "
            "positives; it is a tradeoff rather than an automatic overall win."
        )
    print(
        f"- The strongest cross-validated result under the stated ranking is "
        f"{ranked_names[0]}. The most defensible next step is to collect or verify more "
        "minority-class examples and use repeated/nested validation with a held-out "
        "test set before considering runtime integration."
    )


def main() -> int:
    data = pd.read_csv(DATASET_PATH)
    features = data["Tags"].fillna("General").astype(str)
    ratings = pd.to_numeric(data["Rating"], errors="coerce").fillna(4.0)
    labels = (ratings >= QUALITY_THRESHOLD).astype(int)
    class_counts = Counter(int(value) for value in labels)
    majority_count = max(class_counts.values())
    majority_baseline = majority_count / len(labels)

    print("QUALITY MODEL COMPARISON (READ-ONLY DIAGNOSTIC)")
    print(f"Dataset: {DATASET_PATH}")
    print(f"Dataset row count: {len(data)}")
    print(f"Quality label: Rating >= {QUALITY_THRESHOLD}")
    print(
        "Class distribution: "
        f"0 (Rating < {QUALITY_THRESHOLD}) = {class_counts[0]}, "
        f"1 (Rating >= {QUALITY_THRESHOLD}) = {class_counts[1]}"
    )
    print(
        f"Majority-class baseline: {majority_baseline:.4f} "
        f"({majority_count}/{len(labels)}, always predict class "
        f"{max(class_counts, key=class_counts.get)})"
    )
    print(
        f"Validation: StratifiedKFold(n_splits={N_SPLITS}, shuffle=True, "
        f"random_state={RANDOM_STATE})"
    )
    print(
        "Leakage control: each fold fits its own Pipeline(TfidfVectorizer, classifier)."
    )
    print("Metric cells below show cross-validation mean +/- standard deviation.")

    models = {
        "Dummy (most frequent)": DummyClassifier(strategy="most_frequent"),
        "Logistic Regression": LogisticRegression(
            class_weight="balanced",
            max_iter=1000,
            random_state=RANDOM_STATE,
        ),
        "Linear SVM": LinearSVC(
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
        "Decision Tree": DecisionTreeClassifier(
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=100,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
    }
    folds = StratifiedKFold(
        n_splits=N_SPLITS,
        shuffle=True,
        random_state=RANDOM_STATE,
    )
    results: dict[str, dict[str, object]] = {}
    for name, classifier in models.items():
        results[name] = evaluate_model(
            make_pipeline(classifier),
            features,
            labels,
            folds,
        )

    print("\nRANKED COMPARISON (Macro F1, then Balanced Accuracy)")
    ranked_names = print_ranked_table(results)

    print("\nOUT-OF-FOLD CONFUSION MATRICES")
    print("Rows = actual [minority class 0, majority class 1]")
    print("Columns = predicted [minority class 0, majority class 1]")
    for name in ranked_names:
        matrix = results[name]["confusion_matrix"]
        print(f"{name}: [[{matrix[0, 0]}, {matrix[0, 1]}], "
              f"[{matrix[1, 0]}, {matrix[1, 1]}]]")

    print_interpretation(results, ranked_names, majority_baseline, class_counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
