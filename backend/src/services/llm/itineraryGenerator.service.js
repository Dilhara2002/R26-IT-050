import { askOllama } from "./ollama.service.js";

export const generateItineraryText = async ({
  prompt,
  preferences,
  packages,
}) => {
  const itineraryPrompt = `
You are a Sri Lankan tourism itinerary generator.

Generate a clear day-wise travel package using ONLY the graph-validated data below.

Rules:
- Do NOT invent hotels.
- Do NOT invent activities.
- Use only the activities provided in graph validated packages.
- If activities are fewer than days, distribute them sensibly.
- Keep it practical, simple, and readable.
- Return ONLY valid JSON.
- No markdown.
- No explanation.

User request:
${prompt}

Extracted preferences:
${JSON.stringify(preferences, null, 2)}

Graph validated packages:
${JSON.stringify(packages, null, 2)}

Return exactly this JSON format:
{
  "title": "",
  "summary": "",
  "selectedHotel": {
    "name": "",
    "district": "",
    "grade": "",
    "foodType": "",
    "category": ""
  },
  "dayWisePlan": [
    {
      "day": 1,
      "activities": [],
      "notes": ""
    }
  ],
  "whyThisPackageMatches": []
}
`;

  const response = await askOllama(itineraryPrompt);

  return JSON.parse(response);
};