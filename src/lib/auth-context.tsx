import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAuthClient, isAuthConfigured } from "./auth-client";
import { resetSessionDefaultAvatar } from "./default-avatar";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isAuthConfigured);

  useEffect(() => {
    if (!isAuthConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;
    let authRevision = 0;
    let unsubscribe: (() => void) | undefined;
    void getAuthClient()
      .then(async (authClient) => {
        if (!mounted || !authClient) {
          if (mounted) setLoading(false);
          return;
        }
        const { data } = authClient.onAuthStateChange((event, nextSession) => {
          authRevision += 1;
          if (event === "SIGNED_IN") resetSessionDefaultAvatar();
          if (mounted) setSession(nextSession);
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const requestedRevision = authRevision;
        const sessionResponse = await authClient.getSession();
        if (mounted && authRevision === requestedRevision) setSession(sessionResponse.data.session);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo(
    () => ({ configured: isAuthConfigured, loading, session }),
    [loading, session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
