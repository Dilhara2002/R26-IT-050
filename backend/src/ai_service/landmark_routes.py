import os
import io
import json
import threading
import requests
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
from PIL import Image, UnidentifiedImageError
from flask import Blueprint, request, jsonify

landmark_bp = Blueprint('landmark_bp', __name__)

#  Paths
BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, 'models')
DATA_DIR   = os.path.join(BASE_DIR, 'data')

TFLITE_PATH  = os.path.join(MODELS_DIR, 'landmark_mobilenet_quantized.tflite')
SVM_PATH     = os.path.join(MODELS_DIR, 'svm_landmark_classifier.joblib')
SCALER_PATH  = os.path.join(MODELS_DIR, 'svm_scaler.joblib')
LABELS_PATH  = os.path.join(MODELS_DIR, 'labels.txt')
CSV_PATH     = os.path.join(DATA_DIR,   'Sri_Lankan_Landmark.csv')

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

#  Load class names from labels.txt
with open(LABELS_PATH, 'r', encoding='utf-8') as f:
    CLASS_NAMES = [line.strip() for line in f if line.strip()]

NUM_CLASSES = len(CLASS_NAMES)
print(f"[Landmark] Loaded {NUM_CLASSES} classes: {CLASS_NAMES}")

#  CSV to model class name mapping
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

#  Load CSV (rich landmark metadata)
df_landmarks = pd.read_csv(CSV_PATH, encoding='utf-8').fillna("")

def lookup_metadata(class_name: str) -> dict:
    if not class_name:
        return {}
    search_term = CLASS_TO_CSV_SEARCH.get(class_name, class_name.replace('_', ' '))
    rows = df_landmarks[
        df_landmarks['Landmark Name'].str.contains(
            search_term, case=False, na=False, regex=False
        )
    ]
    if rows.empty:
        # Fallback: general query match across description or name
        rows = df_landmarks[
            df_landmarks['Landmark Name'].str.contains(
                class_name, case=False, na=False, regex=False
            )
        ]
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

#  Load TFLite Interpreter
tflite_interpreter = tf.lite.Interpreter(model_path=TFLITE_PATH)
tflite_interpreter.allocate_tensors()
input_details  = tflite_interpreter.get_input_details()
output_details = tflite_interpreter.get_output_details()
tflite_lock = threading.Lock()
print(f"[Landmark] TFLite model loaded from {TFLITE_PATH}")

# Load Madush's trained SVM classifier by default. MobileNetV2 downloads its
# feature weights once and caches them; TFLite remains the automatic fallback.
svm_available = False
if os.getenv("LANDMARK_ENABLE_SVM", "true").lower() in {"1", "true", "yes"}:
    try:
        from tensorflow.keras.applications import MobileNetV2
        from tensorflow.keras import layers, models as keras_models

        _input = layers.Input(shape=(224, 224, 3))
        _x = tf.keras.applications.mobilenet_v2.preprocess_input(_input)
        _base = MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
        _base.trainable = False
        _x = _base(_x, training=False)
        _x = layers.GlobalAveragePooling2D(name="global_avg_pool")(_x)
        _feature_model = keras_models.Model(inputs=_input, outputs=_x)

        svm_model = joblib.load(SVM_PATH)
        svm_scaler = joblib.load(SCALER_PATH)
        svm_available = True
        print("[Landmark] SVM mode READY (92.56% accuracy).")
    except Exception as e:
        print(f"[Landmark] SVM mode unavailable, falling back to TFLite: {e}")

#  Image helpers
IMG_SIZE = (224, 224)

def preprocess_image_np(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB').resize(IMG_SIZE)
    arr = np.array(img, dtype=np.float32)
    return np.expand_dims(arr, axis=0)

def predict_tflite(img_batch: np.ndarray) -> np.ndarray:
    normalized = img_batch / 255.0
    with tflite_lock:
        tflite_interpreter.set_tensor(input_details[0]['index'], normalized.astype(np.float32))
        tflite_interpreter.invoke()
        return tflite_interpreter.get_tensor(output_details[0]['index'])[0].copy()

def predict_svm(img_batch: np.ndarray) -> np.ndarray:
    features = _feature_model.predict(img_batch, verbose=0)
    scaled   = svm_scaler.transform(features)
    proba    = svm_model.predict_proba(scaled)[0]
    return proba

#  RAG & Gemini Tour Guide Chatbot Logic
def generate_local_rule_response(query: str, meta: dict) -> str:
    """Intelligent rule-based fallback when Gemini API is offline."""
    q = query.lower()
    name = meta.get("landmark_name", "this landmark")

    if any(w in q for w in ["ticket", "price", "fee", "cost", "how much"]):
        price = meta.get("ticket_price", "Standard entry rates apply.")
        hours = meta.get("opening_hours", "Check locally for opening hours.")
        return f"🎟️ **Ticket Information for {name}**:\n- **Foreign Ticket Price:** {price}\n- **Opening Hours:** {hours}"

    if any(w in q for w in ["time", "hour", "open", "close", "duration", "how long", "when"]):
        hours = meta.get("opening_hours", "N/A")
        dur = meta.get("visit_duration", "1-2 hours")
        best = meta.get("best_time_to_visit", "Morning or late afternoon")
        return f"⏰ **Visiting Hours & Timing for {name}**:\n- **Opening Hours:** {hours}\n- **Average Visit Duration:** {dur}\n- **Best Time to Visit:** {best}"

    if any(w in q for w in ["hotel", "restaurant", "food", "eat", "stay", "nearby"]):
        hotels = meta.get("nearby_hotels", "Various local guesthouses available.")
        rests = meta.get("nearby_restaurants", "Local cafes and eateries nearby.")
        attract = meta.get("nearby_attractions", "N/A")
        return f"🏨 **Nearby Places around {name}**:\n- **Hotels:** {hotels}\n- **Restaurants:** {rests}\n- **Nearby Attractions:** {attract}"

    if any(w in q for w in ["history", "built", "who built", "founder", "king", "period", "old", "age"]):
        hist = meta.get("history", meta.get("description", ""))
        builder = meta.get("built_by", "Ancient rulers")
        period = meta.get("year_built", "Historical period")
        signif = meta.get("significance", "")
        return f"🏛️ **History of {name}**:\n{hist}\n\n- **Built By:** {builder}\n- **Historical Period:** {period}\n- **Significance:** {signif}"

    if any(w in q for w in ["dress", "wear", "cloth", "rule", "shoes", "temple"]):
        cat = meta.get("category", "").lower()
        if "temple" in cat or "religious" in cat or "buddhist" in cat or "hindu" in cat:
            return f"👗 **Dress Code & Etiquette for {name}**:\n- Please wear white or modest clothing that covers your shoulders and knees.\n- Remove hats, caps, and footwear before entering the sacred premises.\n- Avoid posing with your back directly turned to Buddha statues for photographs."
        return f"🎒 **Tips for visiting {name}**:\n- Wear comfortable footwear and lightweight breathable clothing.\n- Carry sunscreen, a hat, and plenty of drinking water."

    desc = meta.get("description", "A renowned Sri Lankan landmark.")
    loc = meta.get("province_district", "Sri Lanka")
    return f"🌟 **About {name}** ({loc}):\n{desc}\n\nAsk me about opening hours, ticket prices, history, dress code, or nearby hotels and restaurants!"


def call_gemini_tour_guide(query: str, meta: dict, history: list) -> str:
    api_key = os.getenv("GEMINI_API_KEY") or GEMINI_API_KEY
    if not api_key:
        return generate_local_rule_response(query, meta)

    # Context formatting
    context_str = "\n".join([f"{k.replace('_', ' ').title()}: {v}" for k, v in meta.items() if v])

    system_instruction = f"""
You are "Ayubowan AI", a warm, polite, and knowledgeable Sri Lankan Tour Guide chatbot.
You assist travelers and tourists visiting Sri Lankan landmarks.

VERIFIED LANDMARK KNOWLEDGE BASE:
{context_str if context_str else "General Sri Lankan Tourism"}

GUIDELINES:
1. Answer the user's question clearly, warmly, and concisely based on the verified knowledge base above whenever relevant.
2. If the user asks about tickets, hours, dress codes, or history, provide exact facts from the database.
3. For religious/sacred places (Temples, Kovils, Stupas), always remind visitors about respectful dress codes (cover shoulders/knees, remove shoes).
4. Use polite bullet points and formatting where appropriate.
5. Keep responses engaging, accurate, and easy to read on a mobile screen.
"""

    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    # Build contents with optional chat history
    contents = []

    # Add system context in the first user turn if history exists
    if history and isinstance(history, list):
        for item in history[-6:]: # Keep last 3 turns
            role = item.get("role", "user")
            gemini_role = "user" if role == "user" else "model"
            text = item.get("text", "")
            if text:
                contents.append({"role": gemini_role, "parts": [{"text": text}]})

    # Append current message with system instructions
    combined_message = f"[SYSTEM CONTEXT]\n{system_instruction}\n\n[USER QUERY]\n{query}"
    contents.append({"role": "user", "parts": [{"text": combined_message}]})

    try:
        response = requests.post(
            url,
            headers={
                'Content-Type': 'application/json',
                'x-goog-api-key': api_key,
            },
            json={"contents": contents},
            timeout=8
        )
        if response.status_code == 200:
            res_json = response.json()
            return res_json['candidates'][0]['content']['parts'][0]['text']
        print(f"[Landmark Chat] Gemini unavailable (HTTP {response.status_code}); using local knowledge base.")
        return generate_local_rule_response(query, meta)
    except Exception:
        print("[Landmark Chat] Gemini request failed; using local knowledge base.")
        return generate_local_rule_response(query, meta)


#  Routes
@landmark_bp.route('/api/landmark/predict', methods=['POST'])
def predict():
    if request.content_length and request.content_length > 10 * 1024 * 1024:
        return jsonify({"error": "Image is too large. Maximum upload size is 10 MB."}), 413

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided. Send as multipart form-data with key 'image'."}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No file selected."}), 400

    try:
        image_bytes = file.read()
        img_batch   = preprocess_image_np(image_bytes)

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

        confidence_percent = round(confidence * 100, 2)

        if confidence_percent < 40:
            return jsonify({
                "status": "success",
                "unrecognized": True,
                "confidence": confidence_percent,
                "message": "We couldn't confidently recognize a landmark in this photo."
            }), 200

        # Metadata from CSV
        metadata = lookup_metadata(predicted_class)

        # Build response
        response = {
            "status":        "success",
            "engine":        engine_used,
            "class_id":      predicted_class,
            "confidence":    confidence_percent,
            "metadata":      metadata
        }

        return jsonify(response), 200

    except (UnidentifiedImageError, OSError, ValueError):
        return jsonify({"error": "The uploaded file is not a valid image."}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@landmark_bp.route('/api/landmark/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json() or {}
        user_message = data.get("message", "").strip()
        landmark_name = data.get("landmark_name", "").strip()
        history = data.get("history", [])

        if not user_message:
            return jsonify({"error": "Message is required."}), 400

        # Retrieve metadata for the landmark
        meta = lookup_metadata(landmark_name) if landmark_name else {}

        # If no specific landmark is provided, try extracting landmark from message
        if not meta:
            for cls in CLASS_NAMES:
                search_term = CLASS_TO_CSV_SEARCH.get(cls, cls.replace('_', ' ')).lower()
                if search_term in user_message.lower():
                    meta = lookup_metadata(cls)
                    landmark_name = meta.get("landmark_name", cls)
                    break

        # Generate response via Gemini or rule-based fallback
        bot_reply = call_gemini_tour_guide(user_message, meta, history)

        return jsonify({
            "status": "success",
            "reply": bot_reply,
            "landmark_name": meta.get("landmark_name", landmark_name),
            "category": meta.get("category", "")
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@landmark_bp.route('/api/landmark/list', methods=['GET'])
def list_landmarks():
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


@landmark_bp.route('/api/landmark/health', methods=['GET'])
def landmark_health():
    return jsonify({
        "status": "ok",
        "classes": NUM_CLASSES,
        "default_engine": "svm" if svm_available else "tflite",
        "svm_available": svm_available,
    }), 200
