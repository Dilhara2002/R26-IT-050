import pandas as pd
import os

# Path where the dataset files are stored
DATA_PATH = os.path.join(os.path.dirname(__file__), "../data")

# Dataset file names
VEHICLE_FILE = "vehicles.csv"
ROAD_FILE = "Road Dataset.csv"
DISASTER_FILE = "Disaster Dataset.csv"


def encode_column(df, column_name, new_column_name):
    """
    Convert text/categorical values into numeric values.
    If the column does not exist, skip it safely.
    """
    if column_name in df.columns:
        df[new_column_name] = df[column_name].astype(str).str.strip().astype("category").cat.codes
    else:
        print(f"⚠️ Column not found: {column_name}")

    return df


def clean_columns(df):
    """
    Remove extra spaces from column names.
    """
    df.columns = df.columns.str.strip()
    return df


def load_and_preprocess():
    print("🔄 Loading datasets...")

    # Load datasets
    vehicles = pd.read_csv(os.path.join(DATA_PATH, VEHICLE_FILE))
    roads = pd.read_csv(os.path.join(DATA_PATH, ROAD_FILE))
    disasters = pd.read_csv(os.path.join(DATA_PATH, DISASTER_FILE))

    # Clean column names
    vehicles = clean_columns(vehicles)
    roads = clean_columns(roads)
    disasters = clean_columns(disasters)

    print("✅ Datasets loaded successfully!")

    # -----------------------------
    # 1. Vehicle Dataset Processing
    # -----------------------------
    vehicles = encode_column(vehicles, "Drive Type", "Drive_Type_Enc")
    vehicles = encode_column(vehicles, "Fuel Type", "Fuel_Type_Enc")
    vehicles = encode_column(vehicles, "Vehicle Type", "Vehicle_Type_Enc")

    # -----------------------------
    # 2. Road Dataset Processing
    # -----------------------------
    roads = encode_column(roads, "Terrain Type", "Terrain_Enc")
    roads = encode_column(roads, "Road Surface Condition", "Surface_Enc")
    roads = encode_column(roads, "Surface", "Surface_Enc")

    # -----------------------------
    # 3. Disaster Dataset Processing
    # -----------------------------
    severity_map = {
        "low": 1,
        "moderate": 2,
        "medium": 2,
        "high": 3,
        "very high": 4,
        "critical": 5
    }

    severity_columns = [
        "Severity Level",
        "Severity",
        "Risk Level"
    ]

    severity_found = False

    for column in severity_columns:
        if column in disasters.columns:
            disasters["Risk_Level"] = (
                disasters[column]
                .astype(str)
                .str.strip()
                .str.lower()
                .map(severity_map)
                .fillna(0)
                .astype(int)
            )
            severity_found = True
            break

    if not severity_found:
        print("⚠️ No severity column found in disaster dataset.")

    # Save processed datasets
    vehicles.to_csv(os.path.join(DATA_PATH, "processed_vehicles.csv"), index=False)
    roads.to_csv(os.path.join(DATA_PATH, "processed_roads.csv"), index=False)
    disasters.to_csv(os.path.join(DATA_PATH, "processed_disasters.csv"), index=False)

    print("✅ Preprocessing Done!")
    print("✅ processed_vehicles.csv saved")
    print("✅ processed_roads.csv saved")
    print("✅ processed_disasters.csv saved")

    # Show sample data
    print("\nSample Vehicle Data:")
    print(vehicles.head())

    print("\nSample Road Data:")
    print(roads.head())

    print("\nSample Disaster Data:")
    print(disasters.head())


if __name__ == "__main__":
    load_and_preprocess()