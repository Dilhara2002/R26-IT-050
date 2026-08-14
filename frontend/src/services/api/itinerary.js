import { apiClient, unwrap } from "./client";

export async function optimizeItinerary(input) {
  return unwrap(await apiClient.post("/itineraries/optimize", input));
}
