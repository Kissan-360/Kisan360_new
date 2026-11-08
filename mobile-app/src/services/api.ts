/**
 * Kisan360 mobile API client (Expo).
 * Contract mirrors web-app + backend routes — same endpoints, same shapes.
 * Base URL: EXPO_PUBLIC_API_URL or Config from expo-constants.
 */
import axios from "axios";
import Constants from "expo-constants";

export const API_BASE =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  (process.env.EXPO_PUBLIC_API_URL as unknown as string) ??
  "http://localhost:5000/api";

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

// Token stored by AuthContext after POST /auth/demo-login
// (use expo-secure-store in production; this module reads from a setter)
let _token: string | null = null;
export function setApiToken(token: string | null) {
  _token = token;
  api.defaults.headers.common["Authorization"] = token ? `Bearer ${token}` : "";
}

export const Endpoints = {
  demoLogin: (role: string, district?: string) =>
    api.post("/auth/demo-login", { role, district }),
  marketPrices: (crop: string, district?: string) =>
    api.get("/market/prices", { params: { crop, district } }),
  netRealization: (crop: string, district: string, quantity: number) =>
    api.get("/market/net-realization", { params: { crop, district, quantity } }),
  createLot: (payload: Record<string, unknown>) => api.post("/lots", payload),
  listLots: () => api.get("/lots"),
  createOffer: (payload: Record<string, unknown>) => api.post("/offers", payload),
  releasePayment: (id: string) =>
    api.post(`/payments/${id}/simulate-release`),
  failPayment: (id: string) => api.post(`/payments/${id}/simulate-failure`),
  chat: (message: string, context: Record<string, unknown>, language = "en", mode = "action") =>
    api.post("/chat", { message, context, language, mode }),
  gradeAssessment: (payload: Record<string, unknown>) =>
    api.post("/grade-assessment", payload),
  // ── Disease: backend accepts multipart OR base64 JSON ──
  diseaseDetectBase64: (imageData: string, cropType?: string) =>
    api.post("/disease/detect", { imageData, cropType }),
  diseaseDetectForm: (formData: FormData) =>
    api.post("/disease/detect", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

export default api;
