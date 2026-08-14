import { apiClient, unwrap } from "./client";

export async function recommendVehicle(input) {
  return unwrap(await apiClient.post("/safety/vehicle-recommendations", input));
}
