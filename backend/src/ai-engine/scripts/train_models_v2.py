import os

import joblib
import numpy as np
import pandas as pd

from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingClassifier,
    RandomForestClassifier,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import (
    GroupKFold,
    GroupShuffleSplit,
    cross_validate,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.abspath(
    os.path.join(SCRIPT_DIR, "../data/risk_training_dataset.csv")
)
MODEL_PATH = os.path.join(SCRIPT_DIR, "risk_model_v2.joblib")
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "../data"))
RESULTS_PATH = os.path.join(DATA_DIR, "model_comparison_results.csv")
STABILITY_SUMMARY_PATH = os.path.join(
    DATA_DIR, "model_stability_summary.csv"
)
STABILITY_SPLITS_PATH = os.path.join(
    DATA_DIR, "model_stability_splits.csv"
)

RANDOM_STATE = 42
FINAL_HOLDOUT_TEST_SIZE = 0.20
CV_SPLITS = 5
CV_SHORTLIST_SIZE = 2
STABILITY_SPLITS = 10
STABILITY_TEST_SIZE = 0.20

CLASS_LABELS = ["Low", "Medium", "High"]

SELECTION_METHOD = (
    "Development-only 5-fold GroupKFold CV creates a top-2 "
    "shortlist by Macro F1 mean and standard deviation. "
    "Repeated development-only GroupShuffleSplit stability then "
    "selects the architecture by highest mean validation Macro F1, "
    "with lower mean train-validation gap as the tie-break."
)

FINAL_HOLDOUT_POLICY = (
    "One final 20% unseen-route GroupShuffleSplit holdout "
    "(random_state=42) is created before model selection, excluded "
    "from CV and repeated stability analysis, and evaluated once only "
    "after the deployment architecture is selected."
)


def load_dataset():
    """Load the fixed v2 dataset and validate its required schema."""

    print("Loading training dataset...")
    df = pd.read_csv(DATA_PATH)

    required_columns = [
        "route_code",
        "risk_level",
        "gradient",
        "elevation",
        "friction",
        "historical_occurrence_count",
        "road_data_available",
        "terrain",
        "road_surface",
        "road_width",
        "hazard_type",
        "season",
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Missing required dataset columns: "
            + ", ".join(missing_columns)
        )

    for column in [
        "gradient",
        "elevation",
        "friction",
        "historical_occurrence_count",
        "road_data_available",
    ]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df[df["risk_level"].isin(CLASS_LABELS)].copy()

    print("Rows:", len(df))
    print("Routes:", df["route_code"].nunique())
    print("\nTarget distribution:")
    print(df["risk_level"].value_counts())

    return df


def prepare_features(df):
    """Return feature data, target, grouping labels, and feature names."""

    numeric_features = [
        "gradient",
        "elevation",
        "friction",
        "historical_occurrence_count",
        "road_data_available",
    ]
    categorical_features = [
        "terrain",
        "road_surface",
        "road_width",
        "hazard_type",
        "season",
    ]
    feature_columns = numeric_features + categorical_features

    return (
        df[feature_columns].copy(),
        df["risk_level"].copy(),
        # route_code is deliberately not an ML feature.
        df["route_code"].copy(),
        numeric_features,
        categorical_features,
    )


def create_preprocessor(numeric_features, categorical_features):
    """Keep preprocessing identical for every candidate model."""

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "onehot",
                OneHotEncoder(
                    handle_unknown="ignore",
                    sparse_output=False,
                ),
            ),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, numeric_features),
            ("categorical", categorical_pipeline, categorical_features),
        ]
    )


def get_models():
    """Return the unchanged v2 candidate model configurations."""

    return {
        "Logistic Regression": LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
        "Decision Tree": DecisionTreeClassifier(
            max_depth=6,
            min_samples_leaf=5,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=300,
            max_depth=10,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        ),
        "Gradient Boosting": GradientBoostingClassifier(
            n_estimators=150,
            learning_rate=0.05,
            max_depth=3,
            random_state=RANDOM_STATE,
        ),
    }


def create_model_pipeline(
    classifier,
    numeric_features,
    categorical_features,
):
    return Pipeline(
        steps=[
            (
                "preprocessor",
                create_preprocessor(
                    numeric_features,
                    categorical_features,
                ),
            ),
            ("classifier", classifier),
        ]
    )


def create_final_holdout(X, y, groups):
    """Create the final unseen-route holdout once, before selection."""

    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=FINAL_HOLDOUT_TEST_SIZE,
        random_state=RANDOM_STATE,
    )
    development_index, final_test_index = next(
        splitter.split(X, y, groups=groups)
    )

    return {
        "X_development": X.iloc[development_index].copy(),
        "y_development": y.iloc[development_index].copy(),
        "groups_development": groups.iloc[development_index].copy(),
        "X_final_test": X.iloc[final_test_index].copy(),
        "y_final_test": y.iloc[final_test_index].copy(),
        "groups_final_test": groups.iloc[final_test_index].copy(),
    }


def run_development_cv(
    X_development,
    y_development,
    groups_development,
    numeric_features,
    categorical_features,
):
    """Compare all candidates using development routes only."""

    scoring = {
        "accuracy": "accuracy",
        "precision_macro": "precision_macro",
        "recall_macro": "recall_macro",
        "f1_macro": "f1_macro",
    }
    cv = GroupKFold(n_splits=CV_SPLITS)
    results = []

    for model_name, classifier in get_models().items():
        pipeline = create_model_pipeline(
            classifier,
            numeric_features,
            categorical_features,
        )
        cv_results = cross_validate(
            pipeline,
            X_development,
            y_development,
            groups=groups_development,
            cv=cv,
            scoring=scoring,
            return_train_score=False,
            n_jobs=1,
            error_score="raise",
        )

        results.append({
            "model": model_name,
            "cv_macro_f1_mean": float(
                cv_results["test_f1_macro"].mean()
            ),
            "cv_macro_f1_std": float(
                cv_results["test_f1_macro"].std()
            ),
            "cv_accuracy_mean": float(
                cv_results["test_accuracy"].mean()
            ),
            "cv_precision_macro_mean": float(
                cv_results["test_precision_macro"].mean()
            ),
            "cv_recall_macro_mean": float(
                cv_results["test_recall_macro"].mean()
            ),
        })

    return pd.DataFrame(results).sort_values(
        by=["cv_macro_f1_mean", "cv_macro_f1_std", "model"],
        ascending=[False, True, True],
    ).reset_index(drop=True)


def select_cv_shortlist(comparison_df, shortlist_size=CV_SHORTLIST_SIZE):
    """Shortlist candidates without observing the final holdout."""

    if len(comparison_df) < shortlist_size:
        raise ValueError(
            "Not enough candidate models for the requested CV shortlist."
        )

    return comparison_df.head(shortlist_size).copy()


def run_development_stability(
    shortlisted_models,
    X_development,
    y_development,
    groups_development,
    numeric_features,
    categorical_features,
):
    """Run repeated unseen-route validation within development routes only."""

    splitter = GroupShuffleSplit(
        n_splits=STABILITY_SPLITS,
        test_size=STABILITY_TEST_SIZE,
        random_state=RANDOM_STATE,
    )
    splits = list(
        splitter.split(
            X_development,
            y_development,
            groups=groups_development,
        )
    )

    split_rows = []
    summary_rows = []

    for model_name in shortlisted_models:
        train_scores = []
        validation_scores = []
        gaps = []

        for split_number, (
            train_index,
            validation_index,
        ) in enumerate(splits, start=1):
            pipeline = create_model_pipeline(
                clone(get_models()[model_name]),
                numeric_features,
                categorical_features,
            )

            X_train = X_development.iloc[train_index]
            y_train = y_development.iloc[train_index]
            X_validation = X_development.iloc[validation_index]
            y_validation = y_development.iloc[validation_index]

            pipeline.fit(X_train, y_train)
            train_score = f1_score(
                y_train,
                pipeline.predict(X_train),
                labels=CLASS_LABELS,
                average="macro",
                zero_division=0,
            )
            validation_score = f1_score(
                y_validation,
                pipeline.predict(X_validation),
                labels=CLASS_LABELS,
                average="macro",
                zero_division=0,
            )
            gap = train_score - validation_score
            validation_routes = sorted(
                groups_development.iloc[validation_index].unique()
            )

            train_scores.append(train_score)
            validation_scores.append(validation_score)
            gaps.append(gap)
            split_rows.append({
                "model": model_name,
                "split": split_number,
                "train_macro_f1": float(train_score),
                "validation_macro_f1": float(validation_score),
                "train_validation_gap": float(gap),
                "validation_route_count": len(validation_routes),
                "validation_route_codes": "|".join(validation_routes),
            })

        summary_rows.append({
            "model": model_name,
            "repeated_splits": STABILITY_SPLITS,
            "validation_test_size": STABILITY_TEST_SIZE,
            "mean_train_macro_f1": float(np.mean(train_scores)),
            "mean_validation_macro_f1": float(
                np.mean(validation_scores)
            ),
            "validation_macro_f1_std": float(
                np.std(validation_scores)
            ),
            "mean_train_validation_gap": float(np.mean(gaps)),
            "worst_validation_macro_f1": float(
                np.min(validation_scores)
            ),
            "best_validation_macro_f1": float(
                np.max(validation_scores)
            ),
        })

    summary_df = pd.DataFrame(summary_rows).sort_values(
        by=[
            "mean_validation_macro_f1",
            "mean_train_validation_gap",
            "model",
        ],
        ascending=[False, True, True],
    ).reset_index(drop=True)

    return summary_df, pd.DataFrame(split_rows)


def evaluate_final_holdout(
    model_name,
    X_development,
    y_development,
    X_final_test,
    y_final_test,
    numeric_features,
    categorical_features,
):
    """Evaluate only the selected architecture on the final holdout."""

    pipeline = create_model_pipeline(
        clone(get_models()[model_name]),
        numeric_features,
        categorical_features,
    )
    pipeline.fit(X_development, y_development)

    development_prediction = pipeline.predict(X_development)
    final_test_prediction = pipeline.predict(X_final_test)
    development_macro_f1 = f1_score(
        y_development,
        development_prediction,
        labels=CLASS_LABELS,
        average="macro",
        zero_division=0,
    )
    final_test_macro_f1 = f1_score(
        y_final_test,
        final_test_prediction,
        labels=CLASS_LABELS,
        average="macro",
        zero_division=0,
    )

    final_metrics = {
        "final_test_macro_f1": float(final_test_macro_f1),
        "final_test_accuracy": float(
            accuracy_score(y_final_test, final_test_prediction)
        ),
        "final_test_precision_macro": float(
            precision_score(
                y_final_test,
                final_test_prediction,
                labels=CLASS_LABELS,
                average="macro",
                zero_division=0,
            )
        ),
        "final_test_recall_macro": float(
            recall_score(
                y_final_test,
                final_test_prediction,
                labels=CLASS_LABELS,
                average="macro",
                zero_division=0,
            )
        ),
        "development_test_gap": float(
            development_macro_f1 - final_test_macro_f1
        ),
    }

    print("\nFinal holdout classification report:")
    print(
        classification_report(
            y_final_test,
            final_test_prediction,
            labels=CLASS_LABELS,
            zero_division=0,
        )
    )
    print("Final holdout confusion matrix:")
    print(
        confusion_matrix(
            y_final_test,
            final_test_prediction,
            labels=CLASS_LABELS,
        )
    )

    return final_metrics


def write_evidence(
    comparison_df,
    shortlist,
    stability_summary_df,
    stability_splits_df,
    selected_model_name,
    final_metrics,
):
    """Write evidence while restricting holdout metrics to the winner."""

    evidence_df = comparison_df.copy()
    shortlist_models = set(shortlist["model"])
    evidence_df["entered_stability_shortlist"] = (
        evidence_df["model"].isin(shortlist_models)
    )
    evidence_df["selected_for_deployment"] = (
        evidence_df["model"] == selected_model_name
    )

    for column, value in final_metrics.items():
        evidence_df[column] = np.nan
        evidence_df.loc[
            evidence_df["model"] == selected_model_name,
            column,
        ] = value

    stability_evidence_df = stability_summary_df.copy()
    stability_evidence_df["selected_for_deployment"] = (
        stability_evidence_df["model"] == selected_model_name
    )
    stability_evidence_df["selection_method"] = SELECTION_METHOD

    evidence_df.to_csv(RESULTS_PATH, index=False)
    stability_evidence_df.to_csv(
        STABILITY_SUMMARY_PATH,
        index=False,
    )
    stability_splits_df.to_csv(
        STABILITY_SPLITS_PATH,
        index=False,
    )

    return evidence_df, stability_evidence_df


def run_development_stability_diagnostic():
    """Diagnostic wrapper using the official development-only logic."""

    df = load_dataset()
    (
        X,
        y,
        groups,
        numeric_features,
        categorical_features,
    ) = prepare_features(df)
    split_data = create_final_holdout(X, y, groups)
    comparison_df = run_development_cv(
        split_data["X_development"],
        split_data["y_development"],
        split_data["groups_development"],
        numeric_features,
        categorical_features,
    )
    shortlist = select_cv_shortlist(comparison_df)
    stability_summary_df, stability_splits_df = run_development_stability(
        shortlist["model"].tolist(),
        split_data["X_development"],
        split_data["y_development"],
        split_data["groups_development"],
        numeric_features,
        categorical_features,
    )

    print("\nDevelopment-only CV shortlist:")
    print(shortlist.to_string(index=False))
    print("\nDevelopment-only repeated stability:")
    print(stability_summary_df.to_string(index=False))

    return comparison_df, stability_summary_df, stability_splits_df


def train_and_compare():
    """Official, deterministic selection, evaluation, and deployment flow."""

    df = load_dataset()
    (
        X,
        y,
        groups,
        numeric_features,
        categorical_features,
    ) = prepare_features(df)
    split_data = create_final_holdout(X, y, groups)
    development_route_codes = sorted(
        split_data["groups_development"].unique()
    )
    final_test_route_codes = sorted(
        split_data["groups_final_test"].unique()
    )

    print("\n================================")
    print("FINAL UNSEEN-ROUTE HOLDOUT")
    print("================================")
    print("Development rows:", len(split_data["X_development"]))
    print("Final holdout rows:", len(split_data["X_final_test"]))
    print("Development routes:", development_route_codes)
    print("Final holdout routes:", final_test_route_codes)
    print(FINAL_HOLDOUT_POLICY)

    comparison_df = run_development_cv(
        split_data["X_development"],
        split_data["y_development"],
        split_data["groups_development"],
        numeric_features,
        categorical_features,
    )
    shortlist = select_cv_shortlist(comparison_df)
    print("\nDevelopment-only CV shortlist:")
    print(shortlist.to_string(index=False))

    stability_summary_df, stability_splits_df = run_development_stability(
        shortlist["model"].tolist(),
        split_data["X_development"],
        split_data["y_development"],
        split_data["groups_development"],
        numeric_features,
        categorical_features,
    )
    selected_model_name = stability_summary_df.iloc[0]["model"]
    selected_cv_row = comparison_df.loc[
        comparison_df["model"] == selected_model_name
    ].iloc[0]
    selected_stability_row = stability_summary_df.iloc[0]

    print("\nDevelopment-only repeated stability:")
    print(stability_summary_df.to_string(index=False))
    print("\nSelected model:", selected_model_name)
    print("Selection method:", SELECTION_METHOD)

    final_metrics = evaluate_final_holdout(
        selected_model_name,
        split_data["X_development"],
        split_data["y_development"],
        split_data["X_final_test"],
        split_data["y_final_test"],
        numeric_features,
        categorical_features,
    )
    evidence_df, stability_evidence_df = write_evidence(
        comparison_df,
        shortlist,
        stability_summary_df,
        stability_splits_df,
        selected_model_name,
        final_metrics,
    )

    deployment_pipeline = create_model_pipeline(
        clone(get_models()[selected_model_name]),
        numeric_features,
        categorical_features,
    )
    deployment_pipeline.fit(X, y)

    model_artifact = {
        "model": deployment_pipeline,
        "model_name": selected_model_name,
        "feature_columns": list(X.columns),
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "target": "risk_level",
        "class_labels": CLASS_LABELS,
        "selection_method": SELECTION_METHOD,
        "cv_shortlist_size": CV_SHORTLIST_SIZE,
        "selected_cv_macro_f1_mean": float(
            selected_cv_row["cv_macro_f1_mean"]
        ),
        "selected_cv_macro_f1_std": float(
            selected_cv_row["cv_macro_f1_std"]
        ),
        "stability_repeated_splits": STABILITY_SPLITS,
        "stability_test_size": STABILITY_TEST_SIZE,
        "stability_mean_validation_macro_f1": float(
            selected_stability_row["mean_validation_macro_f1"]
        ),
        "stability_validation_macro_f1_std": float(
            selected_stability_row["validation_macro_f1_std"]
        ),
        "stability_mean_train_validation_gap": float(
            selected_stability_row[
                "mean_train_validation_gap"
            ]
        ),
        "stability_worst_validation_macro_f1": float(
            selected_stability_row["worst_validation_macro_f1"]
        ),
        "stability_best_validation_macro_f1": float(
            selected_stability_row["best_validation_macro_f1"]
        ),
        "final_holdout_policy": FINAL_HOLDOUT_POLICY,
        **final_metrics,
        "random_state": RANDOM_STATE,
        "training_rows": int(len(X)),
        "route_groups": int(groups.nunique()),
        "development_route_groups": int(
            split_data["groups_development"].nunique()
        ),
        "final_test_route_groups": int(
            split_data["groups_final_test"].nunique()
        ),
        "development_route_codes": development_route_codes,
        "final_test_route_codes": final_test_route_codes,
    }
    joblib.dump(model_artifact, MODEL_PATH)

    print("\n================================")
    print("TRAINING COMPLETE")
    print("================================")
    print("Selected model:", selected_model_name)
    print("Final holdout Macro F1:", final_metrics["final_test_macro_f1"])
    print("Saved model:", MODEL_PATH)
    print("Saved CV evidence:", RESULTS_PATH)
    print("Saved stability evidence:", STABILITY_SUMMARY_PATH)
    print("Saved stability splits:", STABILITY_SPLITS_PATH)

    return {
        "selected_model": selected_model_name,
        "comparison": evidence_df,
        "stability": stability_evidence_df,
        "final_metrics": final_metrics,
        "artifact": model_artifact,
    }


if __name__ == "__main__":
    train_and_compare()
