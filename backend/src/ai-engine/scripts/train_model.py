import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

# Paths
DATA_PATH = "../data/"
MODEL_PATH = "../models/"

def train_safety_model():
    print("🚀 Starting Model Training...")
    
    # 1. Load preprocessed datasets
    vehicles = pd.read_csv(os.path.join(DATA_PATH, 'processed_vehicles.csv'))
    roads = pd.read_csv(os.path.join(DATA_PATH, 'processed_roads.csv'))
    
    # 2. Create synthetic training data (important for experimentation)
    # Assume we need 1000 samples for training
    np.random.seed(42)
    num_samples = 1000
    
    # Randomly combine vehicle and road data to create a training dataset
    train_data = []
    for _ in range(num_samples):
        v = vehicles.sample().iloc[0]
        r = roads.sample().iloc[0]
        
        # Simple logic: Safety depends on (Gradeability - Road Gradient)
        # Also affected by road surface condition
        base_safety = 100 - (abs(v['Gradeability (%)'] - r['Max Gradient (%)']) * 2)
        
        # If road condition is poor, reduce safety score
        if r['Surface_Enc'] == 0:
            base_safety -= 10
        
        # External factor (e.g., rain impact)
        rain_impact = np.random.randint(0, 20)
        
        # Final safety score (bounded between 0 and 100)
        final_safety_score = max(0, min(100, base_safety - rain_impact))
        
        train_data.append([
            v['Engine Capacity (CC)'], v['Max Torque (Nm)'], v['Gradeability (%)'],
            r['Max Gradient (%)'], r['Surface_Enc'], rain_impact, final_safety_score
        ])

    # Create DataFrame
    df_train = pd.DataFrame(train_data, columns=[
        'Engine_CC', 'Torque', 'Gradeability', 'Road_Gradient',
        'Surface_Enc', 'Rain_Impact', 'Safety_Score'
    ])

    # 3. Train the model
    X = df_train.drop('Safety_Score', axis=1)  # Features
    y = df_train['Safety_Score']               # Target
    
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X, y)
    
    # 4. Save the trained model
    if not os.path.exists(MODEL_PATH):
        os.makedirs(MODEL_PATH)
        
    joblib.dump(model, os.path.join(MODEL_PATH, 'safety_model.pkl'))
    print(f"✅ Model trained and saved to {MODEL_PATH}safety_model.pkl")

# Run the function
if __name__ == "__main__":
    train_safety_model()