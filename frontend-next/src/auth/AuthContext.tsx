import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, onUnauthorised } from "../api/client";
import { clearSession, loadSession, parseToken, saveSession, type SessionUser } from "./session";

interface Auth {
  user: SessionUser | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(loadSession);

  // the server saying "no" to any request ends the session here as well
  useEffect(() => {
    onUnauthorised(() => {
      clearSession();
      setUser(null);
    });
    return () => onUnauthorised(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const token = await api<string>("login", { method: "POST", body: { email, password }, quiet401: true });
      const next = parseToken(token);
      if (!next) throw new Error("The server sent a sign in token that could not be read.");
      saveSession(next);
      setUser(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw new Error("Incorrect email or password.", { cause: e });
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api("logout").catch(() => undefined);
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth needs an AuthProvider");
  return auth;
}
