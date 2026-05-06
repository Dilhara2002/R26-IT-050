import sys
import json
import joblib
import os
import pandas as pd

# Path to the trained model
MODEL_PATH = os.path.join(os.path.dirname(__file__), '../models/safety_model.pkl')

def predict():
    try:
        # 1. Read input data sent from Node.js
        input_data = json.loads(sys.argv[1])
        
        # 2. Load the trained ML model
        model = joblib.load(MODEL_PATH)
        
        # 3. Prepare data in the format required for prediction
        # [Engine_CC, Torque, Gradeability, Road_Gradient, Surface_Enc, Rain_Impact]
        features = pd.DataFrame([{
            'Engine_CC': input_data['cc'],
            'Torque': input_data['torque'],
            'Gradeability': input_data['gradeability'],
            'Road_Gradient': input_data['gradient'],
            'Surface_Enc': input_data['surface'],
            'Rain_Impact': input_data['rain']
        }])
        
        # 4. Make prediction
        prediction = model.predict(features)
        
        # 5. Print result (this will be captured by Node.js)
        print(round(prediction[0], 2))
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    predict()