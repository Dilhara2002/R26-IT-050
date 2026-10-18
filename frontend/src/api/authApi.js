import axios from "axios";
import { Platform } from "react-native";
import { API_BASE_URL } from "./apiBase";

// Native sessions stay in memory. Durable native login needs platform secure storage;
// browser authentication uses only the server's HttpOnly cookie.
let nativeToken = null;
export const rememberSession = data => {
  if (Platform.OS !== "web") nativeToken = data?.token || nativeToken;
  return data;
};
export const sessionRequestConfig = () => ({ withCredentials: true, timeout: 10000,
  headers: Platform.OS === "web" ? {} : {
    "X-CeylonGo-Client": "native", ...(nativeToken ? { Authorization: `Bearer ${nativeToken}` } : {}),
  },
});
export const restoreSession = async () => {
  try {
    return (await axios.get(`${API_BASE_URL}/auth/session`, sessionRequestConfig())).data;
  } catch (error) {
    if (error.response?.status === 401) { nativeToken = null; return null; }
    throw error;
  }
};
export const travellerAuth = async ({ name, email, password, register }) =>
  rememberSession((await axios.post(`${API_BASE_URL}/auth/${register ? "register" : "login"}`, { name, email, password }, sessionRequestConfig())).data);
export const endSession = async () => {
  const response = await axios.post(`${API_BASE_URL}/auth/logout`, {}, sessionRequestConfig());
  nativeToken = null;
  return response.data;
};
