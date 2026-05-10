import sys
import json
import joblib
import os

MODEL_PATH = os.path.join(os.path.dirname(__file__), "safety_model.joblib")


def load_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    return joblib.load(MODEL_PATH)


def prepare_single_features(input_data):
    return [[
        float(input_data["cc"]),
        float(input_data["torque"]),
        float(input_data["gradeability"]),
        float(input_data["gradient"]),
        float(input_data["surface"])
    ]]


def prepare_batch_features(input_list):
    features = []

    for item in input_list:
        features.append([
            float(item["cc"]),
            float(item["torque"]),
            float(item["gradeability"]),
            float(item["gradient"]),
            float(item["surface"])
        ])

    return features


def predict():
    try:
        input_data = json.loads(sys.argv[1])
        model = load_model()

        # Batch prediction mode
        if isinstance(input_data, list):
            features = prepare_batch_features(input_data)
            predictions = model.predict(features)

            results = [round(float(score), 2) for score in predictions]
            print(json.dumps(results))
            return

        # Single prediction mode
        features = prepare_single_features(input_data)
        prediction = model.predict(features)

        print(round(float(prediction[0]), 2))

    except Exception as e:
        print(json.dumps({
            "error": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    predict()