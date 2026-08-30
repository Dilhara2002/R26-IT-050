const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000/api";

export async function generateTourismPackage(prompt, stay) {
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
      stay,
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

export async function getSelectedHotelPrice(hotelId, stay) {
  const response = await fetch(`${BASE_URL}/hotel-price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelId, stay }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to retrieve hotel price");
  }
  return data.hotelPricing;
}
