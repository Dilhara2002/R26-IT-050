import json
import os
import sys

import joblib
import pandas as pd


SCRIPT_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

MODEL_PATH = os.path.join(
    SCRIPT_DIR,
    "risk_model_v2.joblib"
)


def load_artifact():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model file not found: {MODEL_PATH}"
        )

    artifact = joblib.load(
        MODEL_PATH
    )

    if not isinstance(artifact, dict):
        raise ValueError(
            "Invalid model artifact format."
        )

    if "model" not in artifact:
        raise ValueError(
            "Model artifact does not contain 'model'."
        )

    return artifact


def to_number_or_none(value):
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def prepare_input(input_data, feature_columns):
    """
    Prepare one inference row matching the exact
    feature schema used during model training.
    """

    row = {
        "gradient":
            to_number_or_none(
                input_data.get("gradient")
            ),

        "elevation":
            to_number_or_none(
                input_data.get("elevation")
            ),

        "friction":
            to_number_or_none(
                input_data.get("friction")
            ),

        "historical_occurrence_count":
            to_number_or_none(
                input_data.get(
                    "historical_occurrence_count"
                )
            ),

        "road_data_available":
            to_number_or_none(
                input_data.get(
                    "road_data_available",
                    1,
                )
            ),

        "terrain":
            str(
                input_data.get(
                    "terrain",
                    "Unknown"
                )
            ).strip(),

        "road_surface":
            str(
                input_data.get(
                    "road_surface",
                    "Unknown"
                )
            ).strip(),

        "road_width":
            str(
                input_data.get(
                    "road_width",
                    "Unknown"
                )
            ).strip(),

        "hazard_type":
            str(
                input_data.get(
                    "hazard_type",
                    "Unknown"
                )
            ).strip(),

        "season":
            str(
                input_data.get(
                    "season",
                    "Unknown"
                )
            ).strip(),
    }

    dataframe = pd.DataFrame(
        [row]
    )

    missing_features = [
        column
        for column in feature_columns
        if column not in dataframe.columns
    ]

    if missing_features:
        raise ValueError(
            "Missing required inference features: "
            + ", ".join(missing_features)
        )

    return dataframe[
        feature_columns
    ]


def predict_risk(input_data):
    artifact = load_artifact()

    model = artifact["model"]

    model_name = artifact.get(
        "model_name",
        "Unknown Model"
    )

    feature_columns = artifact.get(
        "feature_columns"
    )

    if not feature_columns:
        raise ValueError(
            "Model artifact is missing feature_columns."
        )

    X = prepare_input(
        input_data,
        feature_columns
    )

    prediction = model.predict(
        X
    )[0]

    result = {
        "success": True,
        "riskLevel": str(prediction),
        "modelName": model_name,
    }

    if hasattr(
        model,
        "predict_proba"
    ):
        probabilities = model.predict_proba(
            X
        )[0]

        classes = list(
            model.classes_
        )

        probability_map = {
            str(label):
                round(
                    float(probability),
                    4
                )
            for label, probability
            in zip(
                classes,
                probabilities
            )
        }

        confidence = max(
            probability_map.values()
        )

        result[
            "confidence"
        ] = round(
            confidence,
            4
        )

        result[
            "confidencePercent"
        ] = round(
            confidence * 100,
            2
        )

        result[
            "confidenceType"
        ] = "predicted_class_probability"

        result[
            "confidenceInterpretation"
        ] = (
            "Probability assigned by this classifier to "
            "the predicted class; it is not a calibrated "
            "real-world accident or disaster probability."
        )

        result[
            "probabilities"
        ] = probability_map

    else:
        result[
            "confidence"
        ] = None

        result[
            "confidencePercent"
        ] = None

        result[
            "confidenceType"
        ] = "unavailable"

        result[
            "confidenceInterpretation"
        ] = (
            "Classifier confidence is unavailable because "
            "this model does not provide class probabilities."
        )

        result[
            "probabilities"
        ] = {}

    result[
        "inputFeatures"
    ] = {
        column:
            (
                None
                if pd.isna(
                    X.iloc[0][column]
                )
                else X.iloc[0][column]
            )
        for column in feature_columns
    }

    return result


def main():
    try:
        if len(sys.argv) < 2:
            raise ValueError(
                "JSON input argument is required."
            )

        input_data = json.loads(
            sys.argv[1]
        )

        if not isinstance(
            input_data,
            dict
        ):
            raise ValueError(
                "Input must be a single JSON object."
            )

        result = predict_risk(
            input_data
        )

        print(
            json.dumps(
                result,
                ensure_ascii=False
            )
        )

    except Exception as error:
        print(
            json.dumps({
                "success": False,
                "error": str(error),
            })
        )

        sys.exit(1)


if __name__ == "__main__":
    main()
