import { Platform } from "react-native";

// Change this to your machine's local IP and keep http:// and :5000
const AI_SERVICE_BASE_URL = "http://192.168.1.85:5000";

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
