import os
import io
import numpy as np
import pandas as pd
import tensorflow as tf
from PIL import Image
from flask import Blueprint, request, jsonify

landmark_bp = Blueprint('landmark_bp', __name__)

# Load the TFLite model and allocate tensors
tflite_model_path = os.path.join(os.path.dirname(__file__), 'transfer_learning_model.tflite')
interpreter = tf.lite.Interpreter(model_path=tflite_model_path)
interpreter.allocate_tensors()

# Get input and output tensors
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# Load CSV data
csv_path = os.path.join(os.path.dirname(__file__), 'Central_Province_Landmarks.csv')
df = pd.read_csv(csv_path, encoding='latin1')
df = df.fillna("")

CLASS_NAMES = [
    'Ambuluwawa',
    'Commonwealth_war_cemetery',
    'Dambulla_cave_temple',
    'Horton_plains_national_park',
    'Peradeniya_garden',
    'Polannaruwa_Vatadage',
    'Ramboda_Falls',
    'Sigiriya',
    'Temple_Of_The_Tooth'
]

CSV_MAPPING = {
    'Ambuluwawa': 'Ambuluwawa Tower',
    'Commonwealth_war_cemetery': 'Kandy War Cemetery',
    'Dambulla_cave_temple': 'Dambulla Cave Temple',
    'Horton_plains_national_park': 'Horton Plains National Park',
    'Peradeniya_garden': 'Royal Botanical Gardens, Peradeniya',
    'Polannaruwa_Vatadage': 'Polonnaruwa Vatadage',
    'Ramboda_Falls': 'Ramboda Falls',
    'Sigiriya': 'Sigiriya (Lion Rock)',
    'Temple_Of_The_Tooth': 'Temple of the Sacred Tooth Relic'
}

IMG_HEIGHT = 224
IMG_WIDTH = 224

def preprocess_image(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img = img.resize((IMG_WIDTH, IMG_HEIGHT))
    img_array = np.array(img)
    img_array = img_array / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    return img_array

@landmark_bp.route('/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        image_bytes = file.read()
        processed_image = preprocess_image(image_bytes)

        # Predict
        input_data = np.array(processed_image, dtype=np.float32)
        interpreter.set_tensor(input_details[0]['index'], input_data)
        interpreter.invoke()
        predictions = interpreter.get_tensor(output_details[0]['index'])

        predicted_index = np.argmax(predictions[0])
        confidence = float(np.max(predictions[0]))

        predicted_class = CLASS_NAMES[predicted_index]
        csv_landmark_name = CSV_MAPPING.get(predicted_class)

        # Look up in CSV
        landmark_data = df[df['Landmark'] == csv_landmark_name]

        if landmark_data.empty:
            response_data = {
                "landmark": csv_landmark_name,
                "confidence": confidence,
                "Basic Info": "Details not found in dataset.",
            }
        else:
            row = landmark_data.iloc[0].to_dict()
            response_data = {
                "landmark": csv_landmark_name,
                "confidence": confidence,
            }
            for key, value in row.items():
                if str(key).strip() and str(value).strip():
                    response_data[key] = str(value)

        return jsonify(response_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500
