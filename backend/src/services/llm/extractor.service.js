import { askOllama } from "./ollama.service.js";
import { preferenceExtractionPrompt } from "./promptTemplates.js";
import { validatePreferences } from "./validator.service.js";
import { getGraphSchemaValues } from "../schema.service.js";

export const extractPreferences = async (userPrompt) => {
  const schema = await getGraphSchemaValues();
  const lowerPrompt = userPrompt.toLowerCase();
  const fallback = {
    district: schema.districts.find((value) => lowerPrompt.includes(String(value).toLowerCase())) || null,
    hotelCategory: schema.hotelCategories.find((value) => lowerPrompt.includes(String(value).toLowerCase())) || null,
    grade: null,
    foodType: null,
    durationDays: null,
    activityCategory: null,
    priceLevel: schema.priceLevels.find((value) => lowerPrompt.includes(String(value).toLowerCase())) || null,
    suitableFor: schema.suitableFor.find((value) => lowerPrompt.includes(String(value).toLowerCase())) || null,
  };

  try {
    const prompt = preferenceExtractionPrompt(userPrompt, schema);
    const raw = await askOllama(prompt);
    return validatePreferences(JSON.parse(raw), schema, userPrompt);
  } catch (error) {
    console.warn("Ollama unavailable; using deterministic preference extraction:", error.message);
    return validatePreferences(fallback, schema, userPrompt);
  }
};
