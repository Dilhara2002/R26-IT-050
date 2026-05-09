import { askOllama } from "./ollama.service.js";
import { preferenceExtractionPrompt } from "./promptTemplates.js";
import { validatePreferences } from "./validator.service.js";
import { getGraphSchemaValues } from "../schema.service.js";

export const extractPreferences = async (userPrompt) => {
  const schema = await getGraphSchemaValues();

  const prompt = preferenceExtractionPrompt(userPrompt, schema);

  const raw = await askOllama(prompt);

  const parsed = JSON.parse(raw);

  return validatePreferences(parsed, schema, userPrompt);
};