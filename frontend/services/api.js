import axios from "axios";

export const ITINERARY_API_TIMEOUT_MS = 55000;

const API = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5000/api",
  timeout: ITINERARY_API_TIMEOUT_MS
});

export default API;
