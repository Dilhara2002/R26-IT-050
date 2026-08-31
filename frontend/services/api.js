import axios from "axios";
import { ITINERARY_API_BASE_URL } from "../src/api/apiBase";

export const ITINERARY_API_TIMEOUT_MS = 70000;

const API = axios.create({
  baseURL: ITINERARY_API_BASE_URL,
  timeout: ITINERARY_API_TIMEOUT_MS
});

export default API;
