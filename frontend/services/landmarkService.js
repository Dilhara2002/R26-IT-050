import { Platform } from "react-native";
import Constants from "expo-constants";

function getDevelopmentHost() {
  if (Platform.OS === "web" && globalThis.location?.hostname) {
    return globalThis.location.hostname;
  }

  const expoHost =
    Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || "";
  return expoHost.split(":")[0] || "localhost";
}

const AI_SERVICE_BASE_URL = (
  process.env.EXPO_PUBLIC_AI_SERVICE_BASE_URL ||
  `http://${getDevelopmentHost()}:5002`
).replace(/\/$/, "");

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Landmark service returned an invalid response (${response.status}).`);
  }
  return response.json();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Landmark service timed out. Please try again.");
    }
    throw new Error(
      `Cannot connect to the landmark service at ${AI_SERVICE_BASE_URL}. Make sure the AI backend is running.`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Predict the landmark in a given image.
 *
 * @param {object} imageAsset  - Expo image-picker asset
 *   { uri: string, type: string, fileName: string }
 * @param {'svm'|'tflite'} mode - 
 * @returns {Promise<object>} API response JSON
 */
export async function predictLandmark(imageAsset, mode = "tflite") {
  const formData = new FormData();
  
  const photoUri =
    Platform.OS === "android"
      ? imageAsset.uri
      : imageAsset.uri.replace("file://", "");

  const fileType = imageAsset.mimeType || "image/jpeg";
  const fileName = imageAsset.fileName || (photoUri.split("/").pop() || "photo.jpg");

  if (Platform.OS === "web" && imageAsset.file) {
    formData.append("image", imageAsset.file, fileName);
  } else {
    formData.append("image", {
      uri: photoUri,
      type: fileType,
      name: fileName,
    });
  }

  const url = `${AI_SERVICE_BASE_URL}/api/landmark/predict?mode=${mode}`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  const data = await parseResponse(response);

  if (!response.ok || data.error) {
    throw new Error(data.error || "Prediction failed. Please try again.");
  }

  return data;
}

export async function fetchSupportedLandmarks() {
  const response = await fetchWithTimeout(`${AI_SERVICE_BASE_URL}/api/landmark/list`);
  const data = await parseResponse(response);
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

  const response = await fetchWithTimeout(url, {
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

  const data = await parseResponse(response);

  if (!response.ok || data.error) {
    throw new Error(data.error || "Tour guide bot is currently unavailable.");
  }

  return data;
}
