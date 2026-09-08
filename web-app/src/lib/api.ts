import { API_URL } from '../config/api';

// Shared API client for the web app.
// - API_URL is the backend base (vite proxy in dev, or VITE_API_URL in prod).
// - apiFetch() automatically attaches the demo JWT when one is stored, so
//   every gated endpoint (farms, detections, lots, offers, payments) works
//   from the UI without sprinkling headers around.

const TOKEN_KEY = 'kisan360_demo_token';
const USER_KEY = 'kisan360_demo_user';

export type DemoRole = 'farmer' | 'buyer' | 'fpo' | string;

export interface DemoUser {
  uid: string;
  role: DemoRole;
  name: string;
  district: string;
  demo: true;
}

export function getDemoToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getDemoUser(): DemoUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as DemoUser) : null;
  } catch {
    return null;
  }
}

export function setDemoAuth(token: string, user: DemoUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearDemoAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isDemoSession(): boolean {
  return !!getDemoToken() && !!getDemoUser();
}

// Thin wrapper over fetch that injects Authorization when a demo token exists.
// `url` is the full endpoint URL (e.g. `${API_URL}/farms`).
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getDemoToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!isFormData && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

export { API_URL };
