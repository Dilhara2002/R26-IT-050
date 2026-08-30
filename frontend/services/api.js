import axios from "axios";

export const ITINERARY_API_TIMEOUT_MS = 70000;

const SHARED_API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://localhost:5001/api"
).replace(/\/$/, "");

const API_BASE_URL =
  process.env.EXPO_PUBLIC_ITINERARY_API_BASE_URL ||
  `${SHARED_API_BASE_URL}/itinerary`;

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: ITINERARY_API_TIMEOUT_MS
});

export default API;
