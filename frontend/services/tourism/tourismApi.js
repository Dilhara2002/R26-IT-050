const BASE_URL = "http://YOUR_PC_IP:5000/api";

export async function generateTourismPackage(userPrompt) {
  const response = await fetch(`${BASE_URL}/recommend`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      userPrompt,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed");
  }

  return data;
}