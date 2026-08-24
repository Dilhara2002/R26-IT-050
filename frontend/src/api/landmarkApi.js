const LANDMARK_API_URL =
  process.env.EXPO_PUBLIC_LANDMARK_API_URL || "http://localhost:5002/predict";

export async function recognizeLandmark(asset) {
  const formData = new FormData();

  if (asset.file) {
    formData.append("image", asset.file, asset.fileName || "landmark.jpg");
  } else {
    formData.append("image", {
      uri: asset.uri,
      name: asset.fileName || "landmark.jpg",
      type: asset.mimeType || "image/jpeg",
    });
  }

  const response = await fetch(LANDMARK_API_URL, {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Landmark recognition failed.");
  return data;
}
