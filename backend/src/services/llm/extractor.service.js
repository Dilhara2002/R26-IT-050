import { askOllama } from "./ollama.service.js";
import { preferenceExtractionPrompt } from "./promptTemplates.js";
import { validatePreferences } from "./validator.service.js";
import { getGraphSchemaValues } from "../schema.service.js";

export const extractPreferences = async (userPrompt) => {
  const schema = await getGraphSchemaValues();

  const prompt = preferenceExtractionPrompt(userPrompt, schema);

  try {
    const raw = await askOllama(prompt);
    const parsed = JSON.parse(raw);
    return validatePreferences(parsed, schema, userPrompt);
  } catch (error) {
    console.warn(
      `Ollama preference extraction unavailable; using deterministic fallback: ${error.message}`
    );
    return validatePreferences({}, schema, userPrompt);
  }
};
