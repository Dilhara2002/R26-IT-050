import { Platform } from "react-native";
import Constants from "expo-constants";

function developmentHost() {
  if (Platform.OS === "web" && globalThis.location?.hostname) {
    return globalThis.location.hostname;
  }

  const expoHost =
    Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || "";
  return expoHost.split(":")[0] || "localhost";
}

const clean = (value) => String(value).replace(/\/$/, "");

export const API_BASE_URL = clean(
  process.env.EXPO_PUBLIC_API_BASE_URL || `http://${developmentHost()}:5001/api`
);

export const ITINERARY_API_BASE_URL = clean(
  process.env.EXPO_PUBLIC_ITINERARY_API_BASE_URL || `${API_BASE_URL}/itinerary`
);

export const AI_SERVICE_BASE_URL = clean(
  process.env.EXPO_PUBLIC_AI_SERVICE_BASE_URL || `http://${developmentHost()}:5002`
);
