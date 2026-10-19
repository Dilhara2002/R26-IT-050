
import axios from "axios";
import { Platform } from "react-native";
import { API_BASE_URL } from "./apiBase";

// Native sessions stay in memory. Durable native login requires secure storage.
// Browser authentication uses the server's HttpOnly session cookie.
let nativeToken = null;

export const rememberSession = (data) => {
  if (Platform.OS !== "web") {
    nativeToken = data?.token ?? null;
  }
  return data;
};

export const sessionRequestConfig = () => ({
  withCredentials: true,
  timeout: 10000,
  headers: Platform.OS === "web"
    ? {}
    : {
        "X-CeylonGo-Client": "native",
        ...(nativeToken ? { Authorization: `Bearer ${nativeToken}` } : {}),
      },
});

export const restoreSession = async () => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/auth/session`,
      sessionRequestConfig()
    );
    return rememberSession(response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      nativeToken = null;
      return null;
    }
    throw error;
  }
};

export const travellerAuth = async ({ name, email, password, register }) => {
  const response = await axios.post(
    `${API_BASE_URL}/auth/${register ? "register" : "login"}`,
    { name, email, password },
    sessionRequestConfig()
  );
  return rememberSession(response.data);
};

// Backward-compatible API functions for components from the POI branch.
// These use the session-based backend, not the old JWT user service.
export const loginUser = (email, password) =>
  travellerAuth({ email, password, register: false });

export const registerUser = (name, email, password) =>
  travellerAuth({ name, email, password, register: true });

export const endSession = async () => {
  const response = await axios.post(
    `${API_BASE_URL}/auth/logout`,
    {},
    sessionRequestConfig()
  );
  nativeToken = null;
  return response.data;
};
