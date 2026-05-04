import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
import os

# Path where the dataset files are stored
DATA_PATH = "../data/"

def load_and_preprocess():
    print("🔄 Loading datasets...")
    
    # 1. Read dataset files
    vehicles = pd.read_csv(os.path.join(DATA_PATH, 'Sri Lankan Tourism Vehicle Dataset.csv'))
    roads = pd.read_csv(os.path.join(DATA_PATH, 'Sri Lanka Road Safety Data .csv'))
    disasters = pd.read_csv(os.path.join(DATA_PATH, 'Sri Lanka Disaster & Weather Risk.csv'))

    # Initialize Label Encoder
    le = LabelEncoder()

    # 2. Clean and preprocess vehicle data
    vehicles['Drive_Type_Enc'] = le.fit_transform(vehicles['Drive Type'])
    vehicles['Fuel_Type_Enc'] = le.fit_transform(vehicles['Fuel Type'])
    
    # 3. Clean and preprocess road data
    roads['Terrain_Enc'] = le.fit_transform(roads['Terrain Type'])
    roads['Surface_Enc'] = le.fit_transform(roads['Road Surface Condition'])

    # 4. Convert disaster severity into numerical values
    severity_map = {'Low': 1, 'Moderate': 2, 'High': 3}
    disasters['Risk_Level'] = disasters['Severity Level'].map(severity_map)

    print("✅ Preprocessing Done!")
    
    # Display a sample of processed vehicle data
    print("\nSample Vehicle Data:")
    print(vehicles[['Model Name', 'Drive_Type_Enc']].head())

    # Save processed datasets for future use
    vehicles.to_csv(os.path.join(DATA_PATH, 'processed_vehicles.csv'), index=False)
    roads.to_csv(os.path.join(DATA_PATH, 'processed_roads.csv'), index=False)
    disasters.to_csv(os.path.join(DATA_PATH, 'processed_disasters.csv'), index=False)

# Run the function
if __name__ == "__main__":
    load_and_preprocess()