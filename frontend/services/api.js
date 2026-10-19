import axios from "axios";
import { sessionRequestConfig } from "../src/api/authApi";
import { ITINERARY_API_BASE_URL } from "../src/api/apiBase";

export const ITINERARY_API_TIMEOUT_MS = 70000;

const API = axios.create({
  baseURL: ITINERARY_API_BASE_URL,
  timeout: ITINERARY_API_TIMEOUT_MS
});

API.interceptors.request.use((config) => {
  const session = sessionRequestConfig();
  config.withCredentials = session.withCredentials;
  Object.assign(config.headers, session.headers);
  return config;
});

export default API;
