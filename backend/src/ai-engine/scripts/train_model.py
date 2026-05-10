import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import os
import math

# Paths to your datasets
VEHICLE_PATH = "../data/processed_vehicles.csv"
ROAD_PATH = "../data/processed_roads.csv"
MODEL_PATH = "safety_model.joblib"


def clean_and_load_csv(file_path):
    try:
        df = pd.read_csv(file_path)

        if len(df.columns) == 1:
            header = df.columns[0]
            data = df[header].str.split(",", expand=True)
            new_header = header.split(",")
            data.columns = new_header
            return data

        return df

    except Exception as e:
        print(f"❌ Error cleaning {file_path}: {e}")
        return None


def to_float(value, fallback=0):
    try:
        return float(str(value).replace("%", "").replace(",", "").strip())
    except Exception:
        return fallback


def get_surface_value(surface_text):
    surface = str(surface_text or "").lower()

    if "excellent" in surface:
        return 1
    if "good" in surface:
        return 1
    if "fair" in surface:
        return 2
    if "poor" in surface:
        return 3
    if "bad" in surface:
        return 4

    return 1


def train_safety_engine():
    print("⏳ Loading and fixing datasets for training...")

    vehicles = clean_and_load_csv(VEHICLE_PATH)
    roads = clean_and_load_csv(ROAD_PATH)

    if vehicles is None or roads is None:
        print("❌ Could not load datasets. Please check the files.")
        return

    vehicles.columns = vehicles.columns.str.strip()
    roads.columns = roads.columns.str.strip()

    data_list = []

    print(f"🔄 Processing {len(vehicles)} vehicles and {len(roads)} road segments...")

    for _, v in vehicles.iterrows():
        for _, r in roads.iterrows():
            try:
                cc = to_float(v["Engine Capacity (CC)"])
                torque = to_float(v["Max Torque (Nm)"])
                gradeability = to_float(v["Gradeability (%)"])
                gradient = to_float(r["Max Gradient (%)"])
                surface = get_surface_value(r.get("Road Surface Condition", ""))

                base_score = 90

                gradient_penalty = gradient * 2.2

                surface_penalty = (surface - 1) * 5

                power_bonus = (cc / 1000) + (torque / 100)

                gradeability_bonus = gradeability * 0.15

                final_score = (
                    base_score
                    - gradient_penalty
                    - surface_penalty
                    + power_bonus
                    + gradeability_bonus
                )

                final_score = max(5, min(100, final_score))

                data_list.append(
                    {
                        "cc": cc,
                        "torque": torque,
                        "gradeability": gradeability,
                        "gradient": gradient,
                        "surface": surface,
                        "safety_score": final_score,
                    }
                )

            except Exception:
                continue

    if not data_list:
        print("❌ No valid data rows found to train!")
        return

    df = pd.DataFrame(data_list)

    X = df[["cc", "torque", "gradeability", "gradient", "surface"]]
    y = df["safety_score"]

    print(f"🧠 Training Model with {len(df)} scenarios...")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
    )

    model = RandomForestRegressor(
        n_estimators=100,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)

    mae = mean_absolute_error(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    rmse = math.sqrt(mse)
    r2 = r2_score(y_test, y_pred)

    accuracy_percentage = max(0, min(100, r2 * 100))

    joblib.dump(model, MODEL_PATH)

    print("\n📊 Model Evaluation Results")
    print("--------------------------------")
    print(f"R² Score: {r2:.4f}")
    print(f"Model Accuracy: {accuracy_percentage:.2f}%")
    print(f"Mean Absolute Error: {mae:.2f}")
    print(f"Root Mean Squared Error: {rmse:.2f}")
    print("--------------------------------")
    print(f"✅ Success! '{MODEL_PATH}' has been created in scripts folder.")


if __name__ == "__main__":
    train_safety_engine()