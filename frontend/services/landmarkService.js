import { Platform } from "react-native";

// Set EXPO_PUBLIC_AI_SERVICE_BASE_URL to the computer's LAN address when
// testing on a physical phone, for example http://192.168.1.20:5002.
const AI_SERVICE_BASE_URL = (
  process.env.EXPO_PUBLIC_AI_SERVICE_BASE_URL || "http://localhost:5002"
).replace(/\/$/, "");

/**
 * Predict the landmark in a given image.
 *
 * @param {object} imageAsset  - Expo image-picker asset
 *   { uri: string, type: string, fileName: string }
 * @param {'svm'|'tflite'} mode - 
 * @returns {Promise<object>} API response JSON
 */
export async function predictLandmark(imageAsset, mode = "svm") {
  const formData = new FormData();
  
  const photoUri =
    Platform.OS === "android"
      ? imageAsset.uri
      : imageAsset.uri.replace("file://", "");

  const fileType = imageAsset.mimeType || "image/jpeg";
  const fileName = imageAsset.fileName || (photoUri.split("/").pop() || "photo.jpg");

  formData.append("image", {
    uri: photoUri,
    type: fileType,
    name: fileName,
  });

  const url = `${AI_SERVICE_BASE_URL}/api/landmark/predict?mode=${mode}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Prediction failed. Please try again.");
  }

  return data;
}

export async function fetchSupportedLandmarks() {
  const response = await fetch(`${AI_SERVICE_BASE_URL}/api/landmark/list`);
  const data = await response.json();
  if (!response.ok) throw new Error("Could not fetch landmark list.");
  return data;
}

/**
 * Send a chat message to the AI Tour Guide Bot.
 *
 * @param {string} message - User query
 * @param {string} landmarkName - Landmark name or class_id for context
 * @param {Array} history - Array of { role: 'user'|'assistant', text: string }
 * @returns {Promise<object>} API response JSON
 */
export async function sendLandmarkChatMessage(message, landmarkName = "", history = []) {
  const url = `${AI_SERVICE_BASE_URL}/api/landmark/chat`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      message,
      landmark_name: landmarkName,
      history,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Tour guide bot is currently unavailable.");
  }

  return data;
}
