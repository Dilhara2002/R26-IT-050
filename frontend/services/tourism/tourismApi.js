const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000/api";

export async function generateTourismPackage(prompt) {
  if (!prompt || !prompt.trim()) {
    throw new Error("Please enter your travel preferences.");
  }

  const response = await fetch(`${BASE_URL}/generate-package`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Backend returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to generate package");
  }

  return data;
}
