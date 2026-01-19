import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@booktainer/shared";
import { getMe, login as apiLogin, logout as apiLogout } from "../api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await getMe();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    setUser(res.user);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    refresh,
    login,
    logout
  }), [user, loading, refresh, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
