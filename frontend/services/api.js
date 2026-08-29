import axios from "axios";

export const ITINERARY_API_TIMEOUT_MS = 70000;

const API = axios.create({
  baseURL:
    process.env.EXPO_PUBLIC_ITINERARY_API_BASE_URL ||
    "http://127.0.0.1:8080/api/itinerary",
  timeout: ITINERARY_API_TIMEOUT_MS
});

export default API;
