import os
import joblib
import pandas as pd

from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import (
    RandomForestClassifier,
    GradientBoostingClassifier,
)

from sklearn.model_selection import (
    GroupKFold,
    GroupShuffleSplit,
    cross_validate,
)

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix,
)


# --------------------------------------------------
# Paths / configuration
# --------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_PATH = os.path.abspath(
    os.path.join(
        SCRIPT_DIR,
        "../data/risk_training_dataset.csv"
    )
)

MODEL_PATH = os.path.join(
    SCRIPT_DIR,
    "risk_model_v2.joblib"
)

RESULTS_PATH = os.path.abspath(
    os.path.join(
        SCRIPT_DIR,
        "../data/model_comparison_results.csv"
    )
)

RANDOM_STATE = 42

CLASS_LABELS = [
    "Low",
    "Medium",
    "High",
]


# --------------------------------------------------
# 1. Load and validate dataset
# --------------------------------------------------

def load_dataset():

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

    # Ensure numeric columns are actually numeric.
    numeric_to_clean = [
        "gradient",
        "elevation",
        "friction",
        "historical_occurrence_count",
        "road_data_available",
    ]

    for column in numeric_to_clean:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    # Remove rows without a valid target.
    df = df[
        df["risk_level"].isin(CLASS_LABELS)
    ].copy()

    print("Rows:", len(df))
    print(
        "Routes:",
        df["route_code"].nunique()
    )

    print("\nTarget distribution:")
    print(
        df["risk_level"].value_counts()
    )

    print("\nRoad data availability:")
    print(
        df["road_data_available"]
        .value_counts(dropna=False)
    )

    return df


# --------------------------------------------------
# 2. Define ML features
# --------------------------------------------------

def prepare_features(df):

    # Numeric / binary input features
    numeric_features = [
        "gradient",
        "elevation",
        "friction",
        "historical_occurrence_count",
        "road_data_available",
    ]

    # Categorical input features
    categorical_features = [
        "terrain",
        "road_surface",
        "road_width",
        "hazard_type",
        "season",
    ]

    feature_columns = (
        numeric_features
        + categorical_features
    )

    X = df[
        feature_columns
    ].copy()

    y = df[
        "risk_level"
    ].copy()

    # IMPORTANT:
    # route_code is NOT an ML feature.
    # It is used only to prevent the same route
    # appearing across training and evaluation groups.
    groups = df[
        "route_code"
    ].copy()

    return (
        X,
        y,
        groups,
        numeric_features,
        categorical_features,
    )


# --------------------------------------------------
# 3. Preprocessing pipeline
# --------------------------------------------------

def create_preprocessor(
    numeric_features,
    categorical_features,
):

    numeric_pipeline = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(
                    strategy="median"
                ),
            ),
            (
                "scaler",
                StandardScaler(),
            ),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            (
                "imputer",
                SimpleImputer(
                    strategy="most_frequent"
                ),
            ),
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
            (
                "numeric",
                numeric_pipeline,
                numeric_features,
            ),
            (
                "categorical",
                categorical_pipeline,
                categorical_features,
            ),
        ]
    )


# --------------------------------------------------
# 4. Candidate models
# --------------------------------------------------

def get_models():

    return {

        "Logistic Regression":
            LogisticRegression(
                max_iter=2000,
                class_weight="balanced",
                random_state=RANDOM_STATE,
            ),

        "Decision Tree":
            DecisionTreeClassifier(
                max_depth=6,
                min_samples_leaf=5,
                class_weight="balanced",
                random_state=RANDOM_STATE,
            ),

        "Random Forest":
            RandomForestClassifier(
                n_estimators=300,
                max_depth=10,
                min_samples_leaf=3,
                class_weight="balanced",
                random_state=RANDOM_STATE,
                n_jobs=-1,
            ),

        "Gradient Boosting":
            GradientBoostingClassifier(
                n_estimators=150,
                learning_rate=0.05,
                max_depth=3,
                random_state=RANDOM_STATE,
            ),
    }


# --------------------------------------------------
# 5. Build one complete model pipeline
# --------------------------------------------------

def create_model_pipeline(
    classifier,
    numeric_features,
    categorical_features,
):

    preprocessor = create_preprocessor(
        numeric_features,
        categorical_features,
    )

    return Pipeline(
        steps=[
            (
                "preprocessor",
                preprocessor,
            ),
            (
                "classifier",
                classifier,
            ),
        ]
    )


# --------------------------------------------------
# 6. Main training and evaluation
# --------------------------------------------------

def train_and_compare():

    df = load_dataset()

    (
        X,
        y,
        groups,
        numeric_features,
        categorical_features,
    ) = prepare_features(df)


    # ==================================================
    # A. Untouched unseen-route final test set
    # ==================================================

    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=0.20,
        random_state=RANDOM_STATE,
    )

    train_index, test_index = next(
        splitter.split(
            X,
            y,
            groups=groups,
        )
    )

    X_train = X.iloc[
        train_index
    ].copy()

    X_test = X.iloc[
        test_index
    ].copy()

    y_train = y.iloc[
        train_index
    ].copy()

    y_test = y.iloc[
        test_index
    ].copy()

    groups_train = groups.iloc[
        train_index
    ].copy()

    train_routes = sorted(
        groups.iloc[
            train_index
        ].unique()
    )

    test_routes = sorted(
        groups.iloc[
            test_index
        ].unique()
    )


    print("\n================================")
    print("UNSEEN-ROUTE HOLDOUT SPLIT")
    print("================================")

    print(
        "Training rows:",
        len(X_train)
    )

    print(
        "Test rows:",
        len(X_test)
    )

    print(
        "Training routes:",
        len(train_routes)
    )

    print(
        "Test routes:",
        len(test_routes)
    )

    print("\nTest routes:")
    print(test_routes)

    print("\nTest target distribution:")
    print(
        y_test.value_counts()
    )


    # ==================================================
    # B. Group-aware CV using training routes only
    # ==================================================

    cv = GroupKFold(
        n_splits=5
    )

    scoring = {
        "accuracy":
            "accuracy",

        "precision_macro":
            "precision_macro",

        "recall_macro":
            "recall_macro",

        "f1_macro":
            "f1_macro",
    }


    models = get_models()

    results = []

    trained_candidate_models = {}


    for (
        model_name,
        classifier
    ) in models.items():

        print("\n================================")
        print(
            "Training:",
            model_name
        )
        print("================================")


        pipeline = create_model_pipeline(
            classifier,
            numeric_features,
            categorical_features,
        )


        # ----------------------------------------------
        # 5-fold GroupKFold CV
        # Only training routes are used here.
        # ----------------------------------------------

        cv_results = cross_validate(
            pipeline,
            X_train,
            y_train,
            groups=groups_train,
            cv=cv,
            scoring=scoring,
            return_train_score=True,
            n_jobs=1,
            error_score="raise",
        )


        cv_f1_mean = (
            cv_results[
                "test_f1_macro"
            ].mean()
        )

        cv_f1_std = (
            cv_results[
                "test_f1_macro"
            ].std()
        )

        cv_accuracy_mean = (
            cv_results[
                "test_accuracy"
            ].mean()
        )

        cv_precision_mean = (
            cv_results[
                "test_precision_macro"
            ].mean()
        )

        cv_recall_mean = (
            cv_results[
                "test_recall_macro"
            ].mean()
        )


        # ----------------------------------------------
        # Fit candidate on development/training routes.
        # ----------------------------------------------

        pipeline.fit(
            X_train,
            y_train,
        )


        train_pred = pipeline.predict(
            X_train
        )

        test_pred = pipeline.predict(
            X_test
        )


        # ----------------------------------------------
        # Train metrics
        # ----------------------------------------------

        train_f1 = f1_score(
            y_train,
            train_pred,
            average="macro",
            zero_division=0,
        )


        # ----------------------------------------------
        # Final untouched test metrics
        # ----------------------------------------------

        test_accuracy = accuracy_score(
            y_test,
            test_pred,
        )

        test_precision = precision_score(
            y_test,
            test_pred,
            average="macro",
            zero_division=0,
        )

        test_recall = recall_score(
            y_test,
            test_pred,
            average="macro",
            zero_division=0,
        )

        test_f1 = f1_score(
            y_test,
            test_pred,
            average="macro",
            zero_division=0,
        )

        train_test_gap = (
            train_f1
            - test_f1
        )


        # ----------------------------------------------
        # Print candidate results
        # ----------------------------------------------

        print(
            f"\nCV Macro F1: "
            f"{cv_f1_mean:.4f} "
            f"± {cv_f1_std:.4f}"
        )

        print(
            f"CV Accuracy: "
            f"{cv_accuracy_mean:.4f}"
        )

        print(
            f"CV Macro Precision: "
            f"{cv_precision_mean:.4f}"
        )

        print(
            f"CV Macro Recall: "
            f"{cv_recall_mean:.4f}"
        )

        print(
            f"Train Macro F1: "
            f"{train_f1:.4f}"
        )

        print(
            f"Test Macro F1: "
            f"{test_f1:.4f}"
        )

        print(
            f"Test Accuracy: "
            f"{test_accuracy:.4f}"
        )

        print(
            f"Test Macro Precision: "
            f"{test_precision:.4f}"
        )

        print(
            f"Test Macro Recall: "
            f"{test_recall:.4f}"
        )

        print(
            f"Train-Test Gap: "
            f"{train_test_gap:.4f}"
        )


        print(
            "\nClassification Report:"
        )

        print(
            classification_report(
                y_test,
                test_pred,
                labels=CLASS_LABELS,
                zero_division=0,
            )
        )


        print(
            "Confusion Matrix "
            "(rows=true, columns=predicted):"
        )

        matrix = confusion_matrix(
            y_test,
            test_pred,
            labels=CLASS_LABELS,
        )

        print(
            "Labels:",
            CLASS_LABELS
        )

        print(matrix)


        # ----------------------------------------------
        # Store metrics
        # ----------------------------------------------

        results.append({

            "model":
                model_name,

            "cv_macro_f1_mean":
                cv_f1_mean,

            "cv_macro_f1_std":
                cv_f1_std,

            "cv_accuracy_mean":
                cv_accuracy_mean,

            "cv_precision_macro_mean":
                cv_precision_mean,

            "cv_recall_macro_mean":
                cv_recall_mean,

            "train_macro_f1":
                train_f1,

            "test_macro_f1":
                test_f1,

            "test_accuracy":
                test_accuracy,

            "test_precision_macro":
                test_precision,

            "test_recall_macro":
                test_recall,

            "train_test_gap":
                train_test_gap,

        })


        trained_candidate_models[
            model_name
        ] = pipeline


    # ==================================================
    # C. Model comparison
    #
    # IMPORTANT:
    # Selection is based on CV Macro F1,
    # NOT on the untouched test score.
    # ==================================================

    results_df = pd.DataFrame(
        results
    )


    results_df = results_df.sort_values(

        by=[
            "cv_macro_f1_mean",
            "cv_macro_f1_std",
        ],

        ascending=[
            False,
            True,
        ],

    ).reset_index(
        drop=True
    )


    print("\n================================")
    print("FINAL MODEL COMPARISON")
    print("================================")

    print(
        results_df.to_string(
            index=False
        )
    )


    results_df.to_csv(
        RESULTS_PATH,
        index=False,
    )


    # ==================================================
    # D. Select model using CV results only
    # ==================================================

    best_model_name = (
        results_df.iloc[0][
            "model"
        ]
    )


    selected_candidate = (
        trained_candidate_models[
            best_model_name
        ]
    )


    selected_row = (
        results_df.iloc[0]
    )


    print("\n================================")
    print("MODEL SELECTION")
    print("================================")

    print(
        "Selection criterion:"
    )

    print(
        "Highest 5-fold GroupKFold "
        "CV Macro F1"
    )

    print(
        "\nSelected model:",
        best_model_name
    )

    print(
        "Selected CV Macro F1:",
        f"{selected_row['cv_macro_f1_mean']:.4f}"
    )

    print(
        "Selected CV Macro F1 std:",
        f"{selected_row['cv_macro_f1_std']:.4f}"
    )

    print(
        "Untouched Test Macro F1:",
        f"{selected_row['test_macro_f1']:.4f}"
    )

    print(
        "Untouched Test Accuracy:",
        f"{selected_row['test_accuracy']:.4f}"
    )

    print(
        "Train-Test Gap:",
        f"{selected_row['train_test_gap']:.4f}"
    )


    # ==================================================
    # E. Refit selected architecture on FULL dataset
    # for deployment.
    #
    # The untouched test metrics printed above remain
    # the research evaluation results. This refit only
    # creates the deployment artifact after evaluation.
    # ==================================================

    selected_classifier = clone(
        get_models()[
            best_model_name
        ]
    )


    deployment_pipeline = (
        create_model_pipeline(
            selected_classifier,
            numeric_features,
            categorical_features,
        )
    )


    print(
        "\nRefitting selected model "
        "on full 598-row dataset "
        "for deployment..."
    )


    deployment_pipeline.fit(
        X,
        y,
    )


    model_artifact = {

        "model":
            deployment_pipeline,

        "model_name":
            best_model_name,

        "feature_columns":
            list(X.columns),

        "numeric_features":
            numeric_features,

        "categorical_features":
            categorical_features,

        "target":
            "risk_level",

        "class_labels":
            CLASS_LABELS,

        "selection_metric":
            "5-fold GroupKFold CV Macro F1",

        "cv_macro_f1_mean":
            float(
                selected_row[
                    "cv_macro_f1_mean"
                ]
            ),

        "cv_macro_f1_std":
            float(
                selected_row[
                    "cv_macro_f1_std"
                ]
            ),

        "untouched_test_macro_f1":
            float(
                selected_row[
                    "test_macro_f1"
                ]
            ),

        "untouched_test_accuracy":
            float(
                selected_row[
                    "test_accuracy"
                ]
            ),

        "random_state":
            RANDOM_STATE,

        "training_rows":
            int(len(X)),

        "route_groups":
            int(
                groups.nunique()
            ),

    }


    joblib.dump(
        model_artifact,
        MODEL_PATH,
    )


    print("\n================================")
    print("TRAINING COMPLETE")
    print("================================")

    print(
        "Selected model:",
        best_model_name
    )

    print(
        "Saved deployment model:",
        MODEL_PATH
    )

    print(
        "Saved comparison results:",
        RESULTS_PATH
    )

    print(
        "\nIMPORTANT:"
    )

    print(
        "The model was selected using "
        "cross-validation Macro F1."
    )

    print(
        "The unseen-route test set was "
        "used only for final evaluation."
    )

    print("================================")


if __name__ == "__main__":
    train_and_compare()