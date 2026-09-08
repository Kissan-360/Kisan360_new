import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { auth } from '../firebaseConfig';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { API_URL, DemoUser, DemoRole, getDemoToken, getDemoUser, setDemoAuth, clearDemoAuth, isDemoSession } from '../lib/api';

type AuthUser = (User & { demo?: boolean; role?: string; district?: string }) | DemoUser | null;

type AuthContextType = {
  user: AuthUser;
  loading: boolean;
  isDemo: boolean;
  demoSignIn: (role: DemoRole, name?: string, district?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isDemo: false,
  demoSignIn: async () => {},
  logout: async () => {},
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setFirebaseLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

  const logout = async () => {
    if (firebaseUser) {
      try { await fbSignOut(auth); } catch {}
    }
    clearDemoAuth();
    setDemoUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isDemo, demoSignIn, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

export { isDemoSession };

export default useAuth;
