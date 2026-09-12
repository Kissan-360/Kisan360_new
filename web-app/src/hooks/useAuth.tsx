import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { auth, firebaseReady } from '../firebaseConfig';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { API_URL, DemoUser, DemoRole, getDemoToken, getDemoUser, setDemoAuth, clearDemoAuth, isDemoSession, setFirebaseToken, clearFirebaseToken } from '../lib/api';

type AuthUser = (User & { demo?: boolean; role?: string; district?: string }) | DemoUser | null;

type AuthContextType = {
  user: AuthUser;
  loading: boolean;
  isDemo: boolean;
  demoSignIn: (role: DemoRole, name?: string, district?: string) => Promise<void>;
  logout: () => Promise<void>;
  // Re-reads auth.currentUser into state. Needed after updateProfile, which
  // does not refire onAuthStateChanged — without this the UI keeps showing
  // the stale display name until the next login.
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isDemo: false,
  demoSignIn: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

function normalizeDemoUser(raw: any): DemoUser & { displayName: string; email: string } {
  const name = raw.name || 'Demo Farmer';
  return {
    uid: raw.uid,
    role: raw.role || 'farmer',
    name,
    district: raw.district || '',
    demo: true,
    // Keep existing UI reads (displayName / email) working for demo users.
    displayName: name,
    email: `${raw.uid}@kisan360.demo`,
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseLoading, setFirebaseLoading] = useState(true);
  const [demoUser, setDemoUser] = useState<DemoUser | null>(() => getDemoUser());

  useEffect(() => {
    // If Firebase didn't initialize (missing config, network error), skip
    // the auth listener entirely and fall through to demo-only mode.
    if (!firebaseReady || !auth) {
      console.warn('[Kisan360] Firebase auth unavailable — demo-only mode');
      setFirebaseLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setFirebaseLoading(false);
    });

    // Safety timeout: if onAuthStateChanged doesn't fire within 5s (e.g.
    // Firebase unreachable on rural 2G/3G), stop waiting and let the demo
    // session proceed or show the login page.
    const timeout = setTimeout(() => {
      setFirebaseLoading((prev) => {
        if (prev) console.warn('[Kisan360] Firebase auth timed out — falling back to demo mode');
        return false;
      });
    }, 5000);

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // Bridge the Firebase session into API calls: store a fresh ID token so
  // apiFetch authenticates as the displayed (Firebase) identity. ID tokens
  // expire after ~1h, hence the 50-minute refresh while signed in.
  useEffect(() => {
    if (!firebaseUser) {
      clearFirebaseToken();
      return;
    }
    let cancelled = false;
    const sync = () => {
      firebaseUser.getIdToken().then((t) => { if (!cancelled) setFirebaseToken(t); }).catch(() => {});
    };
    sync();
    const timer = setInterval(sync, 50 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [firebaseUser]);

  // Prefer the persisted demo session so the demo works even before Firebase
  // finishes loading or when Firebase is unreachable.
  const user: AuthUser = firebaseUser ? (firebaseUser as any) : demoUser;
  const loading = firebaseLoading && !demoUser;
  const isDemo = !!demoUser && !firebaseUser;

  const demoSignIn = async (role: DemoRole, name?: string, district?: string) => {
    const resp = await fetch(`${API_URL}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name, district }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.token) {
      throw new Error(data.error || 'Demo login failed — is the backend running?');
    }
    const normalized = normalizeDemoUser(data.user);
    setDemoAuth(data.token, normalized);
    setDemoUser(normalized);
  };

  const refreshUser = async () => {
    if (!auth) return;
    try {
      await auth.currentUser?.reload();
      // Clone so React sees a new object identity and re-renders.
      const u = auth.currentUser;
      setFirebaseUser(u ? ({ ...u } as any) : null);
    } catch { /* keep stale user rather than signing out */ }
  };

  const logout = async () => {
    if (firebaseUser && auth) {
      try { await fbSignOut(auth); } catch {}
    }
    clearFirebaseToken();
    clearDemoAuth();
    setDemoUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isDemo, demoSignIn, logout, refreshUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export { isDemoSession };

export default useAuth;
