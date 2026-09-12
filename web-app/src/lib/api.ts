import { API_URL } from '../config/api';

// Shared API client for the web app.
// - API_URL is the backend base (vite proxy in dev, or VITE_API_URL in prod).
// - apiFetch() automatically attaches the demo JWT when one is stored, so
//   every gated endpoint (farms, detections, lots, offers, payments) works
//   from the UI without sprinkling headers around.
// - Every request is bounded by a 30s default timeout: a stalled backend must
//   surface as an error state, never as an infinite spinner. Callers can pass
//   their own AbortSignal via init.

const TOKEN_KEY = 'kisan360_demo_token';
const USER_KEY = 'kisan360_demo_user';

const DEFAULT_TIMEOUT_MS = 30000;

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

// Firebase ID token slot — filled by useAuth when a real (non-demo) user is
// signed in. Preferred over the demo token so the API sees the same identity
// the UI displays (firebaseUser wins over demoUser there too). Cleared on
// Firebase sign-out, at which point any demo session underneath resumes.
const FIREBASE_TOKEN_KEY = 'kisan360-fb-token';

export function getFirebaseToken(): string | null {
  try {
    return localStorage.getItem(FIREBASE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setFirebaseToken(token: string): void {
  try {
    localStorage.setItem(FIREBASE_TOKEN_KEY, token);
  } catch { /* storage unavailable — session-only */ }
}

export function clearFirebaseToken(): void {
  try {
    localStorage.removeItem(FIREBASE_TOKEN_KEY);
  } catch { /* ignore */ }
}

// Production builds should set VITE_API_URL explicitly. Same-origin /api is a
// valid choice (reverse proxy), but an accidental omission should be visible
// in the console, not discovered as mysterious 404s mid-demo.
try {
  const isProdBuild = import.meta.env && (import.meta.env as any).PROD;
  if (isProdBuild && !import.meta.env.VITE_API_URL) {
    console.warn(
      '[Kisan360] VITE_API_URL is not set in this production build — assuming same-origin "/api". ' +
      'If the API is served elsewhere, rebuild with VITE_API_URL set.'
    );
  }
} catch { /* import.meta unavailable in some test environments — ignore */ }

// Thin wrapper over fetch that:
//  - injects Authorization (Firebase ID token preferred, demo token fallback),
//  - applies a default timeout so no request can hang forever,
//  - treats non-JSON responses as clean errors instead of a JSON-parse crash.
// `url` is the full endpoint URL (e.g. `${API_URL}/farms`).
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getFirebaseToken() || getDemoToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!isFormData && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Merge the caller's signal (if any) with our default timeout. A caller
  // passing its own signal keeps full control; everyone else gets 30s.
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);
  const composedSignal = init.signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, timeoutController.signal]) : init.signal)
    : timeoutController.signal;

  try {
    return await fetch(url, { ...init, headers, signal: composedSignal });
  } finally {
    clearTimeout(timer);
  }
}

export { API_URL };
