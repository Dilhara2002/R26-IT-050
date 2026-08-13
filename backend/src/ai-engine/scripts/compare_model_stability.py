import os
import numpy as np
import pandas as pd

from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import f1_score

import train_models_v2 as tm


SCRIPT_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DATA_DIR = os.path.abspath(
    os.path.join(
        SCRIPT_DIR,
        "../data"
    )
)

SUMMARY_PATH = os.path.join(
    DATA_DIR,
    "model_stability_summary.csv"
)

DETAIL_PATH = os.path.join(
    DATA_DIR,
    "model_stability_splits.csv"
)

N_SPLITS = 10
TEST_SIZE = 0.20
RANDOM_STATE = 42

MODELS_TO_TEST = [
    "Random Forest",
    "Gradient Boosting",
]


def run_stability_analysis():

    print("Loading dataset...")

    df = tm.load_dataset()

    (
        X,
        y,
        groups,
        numeric_features,
        categorical_features,
    ) = tm.prepare_features(df)


    splitter = GroupShuffleSplit(
        n_splits=N_SPLITS,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
    )


    # Create the same route splits once,
    # then reuse them for every model.
    splits = list(
        splitter.split(
            X,
            y,
            groups=groups,
        )
    )


    all_split_results = []
    summary_results = []


    for model_name in MODELS_TO_TEST:

        print("\n================================")
        print(model_name)
        print("================================")


        train_scores = []
        test_scores = []
        gaps = []


        for split_number, (
            train_idx,
            test_idx,
        ) in enumerate(
            splits,
            start=1,
        ):

            classifier = (
                tm.get_models()[
                    model_name
                ]
            )


            pipeline = (
                tm.create_model_pipeline(
                    classifier,
                    numeric_features,
                    categorical_features,
                )
            )


            X_train = X.iloc[
                train_idx
            ]

            X_test = X.iloc[
                test_idx
            ]

            y_train = y.iloc[
                train_idx
            ]

            y_test = y.iloc[
                test_idx
            ]


            pipeline.fit(
                X_train,
                y_train,
            )


            train_pred = (
                pipeline.predict(
                    X_train
                )
            )

            test_pred = (
                pipeline.predict(
                    X_test
                )
            )


            train_f1 = f1_score(
                y_train,
                train_pred,
                labels=tm.CLASS_LABELS,
                average="macro",
                zero_division=0,
            )


            test_f1 = f1_score(
                y_test,
                test_pred,
                labels=tm.CLASS_LABELS,
                average="macro",
                zero_division=0,
            )


            gap = (
                train_f1
                - test_f1
            )


            train_scores.append(
                train_f1
            )

            test_scores.append(
                test_f1
            )

            gaps.append(
                gap
            )


            test_routes = sorted(
                groups.iloc[
                    test_idx
                ].unique()
            )


            all_split_results.append({
                "model":
                    model_name,

                "split":
                    split_number,

                "train_macro_f1":
                    train_f1,

                "test_macro_f1":
                    test_f1,

                "train_test_gap":
                    gap,

                "test_route_count":
                    len(
                        test_routes
                    ),

                "test_routes":
                    "|".join(
                        test_routes
                    ),
            })


            print(
                f"Split {split_number:02d} | "
                f"Train F1={train_f1:.4f} | "
                f"Test F1={test_f1:.4f} | "
                f"Gap={gap:.4f}"
            )


        mean_train = float(
            np.mean(
                train_scores
            )
        )

        mean_test = float(
            np.mean(
                test_scores
            )
        )

        std_test = float(
            np.std(
                test_scores
            )
        )

        mean_gap = float(
            np.mean(
                gaps
            )
        )

        worst_test = float(
            np.min(
                test_scores
            )
        )

        best_test = float(
            np.max(
                test_scores
            )
        )


        summary_results.append({

            "model":
                model_name,

            "repeated_splits":
                N_SPLITS,

            "mean_train_macro_f1":
                mean_train,

            "mean_test_macro_f1":
                mean_test,

            "test_macro_f1_std":
                std_test,

            "mean_train_test_gap":
                mean_gap,

            "worst_test_macro_f1":
                worst_test,

            "best_test_macro_f1":
                best_test,

        })


        print(
            "\nMean Test Macro F1:",
            f"{mean_test:.4f} ± {std_test:.4f}"
        )

        print(
            "Mean Train Macro F1:",
            f"{mean_train:.4f}"
        )

        print(
            "Mean Train-Test Gap:",
            f"{mean_gap:.4f}"
        )

        print(
            "Worst Test Macro F1:",
            f"{worst_test:.4f}"
        )

        print(
            "Best Test Macro F1:",
            f"{best_test:.4f}"
        )


    # --------------------------------------------------
    # Save detailed results
    # --------------------------------------------------

    detail_df = pd.DataFrame(
        all_split_results
    )

    detail_df.to_csv(
        DETAIL_PATH,
        index=False,
    )


    # --------------------------------------------------
    # Select model
    #
    # Primary:
    # Higher repeated unseen-route mean Macro F1
    #
    # Tie-break:
    # Lower mean generalization gap
    # --------------------------------------------------

    summary_df = pd.DataFrame(
        summary_results
    )


    summary_df = (
        summary_df
        .sort_values(
            by=[
                "mean_test_macro_f1",
                "mean_train_test_gap",
            ],
            ascending=[
                False,
                True,
            ],
        )
        .reset_index(
            drop=True
        )
    )


    selected_model = (
        summary_df
        .iloc[0][
            "model"
        ]
    )


    summary_df[
        "selected_for_deployment"
    ] = (
        summary_df[
            "model"
        ]
        ==
        selected_model
    )


    summary_df[
        "selection_method"
    ] = (
        "Repeated unseen-route "
        "GroupShuffleSplit: "
        "highest mean test Macro F1; "
        "lower generalization gap "
        "used as tie-break"
    )


    summary_df.to_csv(
        SUMMARY_PATH,
        index=False,
    )


    print("\n================================")
    print("FINAL STABILITY COMPARISON")
    print("================================")

    print(
        summary_df.to_string(
            index=False
        )
    )


    print("\nSelected model:")
    print(
        selected_model
    )


    print("\nSelection reason:")
    print(
        "Selected using repeated unseen-route "
        "stability testing rather than a "
        "single holdout score."
    )


    print(
        "\nSummary saved to:",
        SUMMARY_PATH
    )

    print(
        "Split details saved to:",
        DETAIL_PATH
    )


if __name__ == "__main__":
    run_stability_analysis()
