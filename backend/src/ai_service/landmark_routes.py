"""
landmark_routes.py — Upgraded Landmark Recognition Service
Supports:
  - Dual inference: SVM mode (92.56% accuracy) and TFLite mode (fast fallback)
  - All 17 Sri Lankan landmark classes
  - Full metadata from Sri_Lankan_Landmark.csv
"""

import os
import io
import json
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
from PIL import Image
from flask import Blueprint, request, jsonify

landmark_bp = Blueprint('landmark_bp', __name__)

# ─────────────────────────────────────────────
#  Paths
# ─────────────────────────────────────────────
BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, 'models')
DATA_DIR   = os.path.join(BASE_DIR, 'data')

TFLITE_PATH  = os.path.join(MODELS_DIR, 'landmark_mobilenet_quantized.tflite')
SVM_PATH     = os.path.join(MODELS_DIR, 'svm_landmark_classifier.joblib')
SCALER_PATH  = os.path.join(MODELS_DIR, 'svm_scaler.joblib')
LABELS_PATH  = os.path.join(MODELS_DIR, 'labels.txt')
CSV_PATH     = os.path.join(DATA_DIR,   'Sri_Lankan_Landmark.csv')

# ─────────────────────────────────────────────
#  Load class names from labels.txt
# ─────────────────────────────────────────────
with open(LABELS_PATH, 'r', encoding='utf-8') as f:
    CLASS_NAMES = [line.strip() for line in f if line.strip()]

NUM_CLASSES = len(CLASS_NAMES)
print(f"[Landmark] Loaded {NUM_CLASSES} classes: {CLASS_NAMES}")

# ─────────────────────────────────────────────
#  CSV to model class name mapping
# ─────────────────────────────────────────────
CLASS_TO_CSV_SEARCH = {
    'Ambuluwawa':                   'Ambuluwawa',
    'Commonwealth_war_cemetery':    'Commonwealth War Cemetery',
    'Dambulla_cave_temple':         'Dambulla Cave Temple',
    'Embekka_Devalaya':             'Embekka Devalaya',
    'Galle_Fort':                   'Galle Fort',
    'Horton_plains_national_park':  'Horton Plains',
    'Lankatilaka_Vihara':           'Lankatilaka',
    'Nalanda_Gedige':               'Nalanda Gedige',
    'Nallur_Kovil':                 'Nallur',
    'Nine_Arches_Bridge':           'Nine Arches',
    'Peradeniya_garden':            'Peradeniya',
    'Polannaruwa_Vatadage':         'Polonnaruwa',
    'Ramboda_Falls':                'Ramboda Falls',
    'Ruwanweli_Maha_Seya':          'Ruwanweli',
    'Sigiriya':                     'Sigiriya',
    'Temple_Of_The_Tooth':          'Temple of the Sacred Tooth',
    'Yapahuwa_Rock_Fortress':       'Yapahuwa Rock Fortress',
}

# ─────────────────────────────────────────────
#  Load CSV (rich landmark metadata)
# ─────────────────────────────────────────────
df_landmarks = pd.read_csv(CSV_PATH, encoding='utf-8').fillna("")

def lookup_metadata(class_name: str) -> dict:
    """Look up landmark info from CSV by class name."""
    search_term = CLASS_TO_CSV_SEARCH.get(class_name, class_name.replace('_', ' '))
    rows = df_landmarks[df_landmarks['Landmark Name'].str.contains(search_term, case=False, na=False)]
    if rows.empty:
        return {}
    row = rows.iloc[0]
    return {
        "landmark_name":     str(row.get('Landmark Name', '')),
        "category":          str(row.get('Category', '')),
        "province_district": str(row.get('Province & District', '')),
        "gps_coordinates":   str(row.get('GPS Coordinates', '')),
        "description":       str(row.get('Description', '')),
        "history":           str(row.get('History', '')),
        "built_by":          str(row.get('Built By / Founder', '')),
        "year_built":        str(row.get('Year Built / Historical Period', '')),
        "significance":      str(row.get('Cultural/Religious Significance', '')),
        "main_attractions":  str(row.get('Main Attractions', '')),
        "opening_hours":     str(row.get('Opening Hours', '')),
        "visit_duration":    str(row.get('Average Visit Duration:', '')),
        "ticket_price":      str(row.get('Ticket Price (Foreign)', '')),
        "best_time_to_visit":str(row.get('Best Time to Visit', '')),
        "nearby_attractions":str(row.get('Nearby Attractions', '')),
        "nearby_hotels":     str(row.get('Nearby Hotels', '')),
        "nearby_restaurants":str(row.get('Nearby Restaurants', '')),
    }

# ─────────────────────────────────────────────
#  Load TFLite Interpreter
# ─────────────────────────────────────────────
tflite_interpreter = tf.lite.Interpreter(model_path=TFLITE_PATH)
tflite_interpreter.allocate_tensors()
input_details  = tflite_interpreter.get_input_details()
output_details = tflite_interpreter.get_output_details()
print(f"[Landmark] TFLite model loaded from {TFLITE_PATH}")

# ─────────────────────────────────────────────
#  Load MobileNetV2 Feature Extractor + SVM
# ─────────────────────────────────────────────
svm_available = False
try:
    from tensorflow.keras.applications import MobileNetV2
    from tensorflow.keras import layers, models as keras_models

    # Build feature extractor identical to training
    _input = layers.Input(shape=(224, 224, 3))
    _x = tf.keras.applications.mobilenet_v2.preprocess_input(_input)
    _base = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
    _base.trainable = False
    _x = _base(_x, training=False)
    _x = layers.GlobalAveragePooling2D(name="global_avg_pool")(_x)
    _feature_model = keras_models.Model(inputs=_input, outputs=_x)

    svm_model  = joblib.load(SVM_PATH)
    svm_scaler = joblib.load(SCALER_PATH)
    svm_available = True
    print("[Landmark] SVM mode READY (92.56% accuracy).")
except Exception as e:
    print(f"[Landmark] SVM mode unavailable, falling back to TFLite: {e}")

# ─────────────────────────────────────────────
#  Image helpers
# ─────────────────────────────────────────────
IMG_SIZE = (224, 224)

def preprocess_image_np(image_bytes: bytes) -> np.ndarray:
    """Load image bytes, resize, and return (1,224,224,3) float32 array in [0,255]."""
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB').resize(IMG_SIZE)
    arr = np.array(img, dtype=np.float32)                     # (224,224,3)
    return np.expand_dims(arr, axis=0)                        # (1,224,224,3)

def predict_tflite(img_batch: np.ndarray) -> np.ndarray:
    """Run TFLite inference. img_batch values should be in [0,255]."""
    normalized = img_batch / 255.0                            # TFLite model expects [0,1]
    tflite_interpreter.set_tensor(input_details[0]['index'], normalized.astype(np.float32))
    tflite_interpreter.invoke()
    return tflite_interpreter.get_tensor(output_details[0]['index'])[0]  # (num_classes,)

def predict_svm(img_batch: np.ndarray) -> np.ndarray:
    """Run MobileNetV2 feature extraction then SVM inference."""
    features = _feature_model.predict(img_batch, verbose=0)   # (1, 1280)
    scaled   = svm_scaler.transform(features)                  # (1, 1280)
    proba    = svm_model.predict_proba(scaled)[0]              # (num_classes,)
    return proba

# ─────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────

@landmark_bp.route('/api/landmark/predict', methods=['POST'])
def predict():
    """
    POST /api/landmark/predict
    Form-data: image file
    Query param: mode=svm|tflite  (default: svm when available)
    Returns: top-1 landmark with full metadata.
    """
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided. Send as multipart form-data with key 'image'."}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No file selected."}), 400

    try:
        image_bytes = file.read()
        img_batch   = preprocess_image_np(image_bytes)         # (1,224,224,3)

        # Select inference mode
        mode = request.args.get('mode', 'svm').lower()
        if mode == 'svm' and svm_available:
            probabilities = predict_svm(img_batch)
            engine_used   = "SVM (92.56% accuracy)"
        else:
            probabilities = predict_tflite(img_batch)
            engine_used   = "TFLite MobileNetV2 (85.32% accuracy)"

        # Top-1 prediction
        top_idx        = int(np.argmax(probabilities))
        confidence     = float(probabilities[top_idx])
        predicted_class = CLASS_NAMES[top_idx]

        # Metadata from CSV
        metadata = lookup_metadata(predicted_class)

        # Build response
        response = {
            "status":        "success",
            "engine":        engine_used,
            "class_id":      predicted_class,
            "confidence":    round(confidence * 100, 2),      # percentage
            "metadata":      metadata
        }

        return jsonify(response), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@landmark_bp.route('/api/landmark/list', methods=['GET'])
def list_landmarks():
    """
    GET /api/landmark/list
    Returns all 17 supported landmark classes with display names.
    """
    landmarks = []
    for cls in CLASS_NAMES:
        meta = lookup_metadata(cls)
        landmarks.append({
            "class_id":      cls,
            "landmark_name": meta.get("landmark_name", cls.replace("_", " ")),
            "category":      meta.get("category", ""),
            "gps_coordinates": meta.get("gps_coordinates", ""),
        })
    return jsonify({"status": "success", "count": len(landmarks), "landmarks": landmarks}), 200
