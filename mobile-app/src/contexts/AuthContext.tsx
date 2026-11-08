import React, { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { Endpoints, setApiToken } from "../services/api";

// Auth Context — demo-login first (backend issues a signed JWT), Firebase optional
interface AuthContextType {
  user: any;
  token: string | null;
  isLoading: boolean;
  loginDemo: (role: "farmer" | "buyer" | "fpo", district?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loginDemo = useCallback(async (role: "farmer" | "buyer" | "fpo", district = "Nashik") => {
    setIsLoading(true);
    try {
      const res = await Endpoints.demoLogin(role, district);
      const t = res.data?.token as string;
      const u = res.data?.user;
      if (!t) throw new Error("No token returned");
      setApiToken(t);
      setToken(t);
      setUser(u || { role, district });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setApiToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = { user, token, isLoading, loginDemo, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
