import axios from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_ITINERARY_API_BASE_URL ||
  "http://127.0.0.1:8080/api/itinerary";

// The Node service gives the bounded Flask request 45 seconds. Keep the
// browser boundary slightly wider so Node can return a controlled 504 instead
// of Axios exposing its own timeout text to the traveller.
export const ITINERARY_API_TIMEOUT_MS = 55000;

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: ITINERARY_API_TIMEOUT_MS,
});

export default API;
