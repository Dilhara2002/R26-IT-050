const BASE_URL = "http://localhost:5000/api";

export async function generateTourismPackage(prompt) {
  const response = await fetch(`${BASE_URL}/generate-package`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to generate package");
  }

  return data;
}