import { apiClient, unwrap } from "./client";

export async function generateRecommendations(prompt) {
  return unwrap(await apiClient.post("/recommendations/packages", { prompt }));
}
