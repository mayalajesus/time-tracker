import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAuthClient, isAuthConfigured } from "./auth-client";
import { resetSessionDefaultAvatar } from "./default-avatar";

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  callbackError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Capture errors before the auth SDK removes the URL fragment.
  const [callbackError, setCallbackError] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return (
      query.get("error") ??
      hash.get("error") ??
      query.get("error_description") ??
      hash.get("error_description")
    );
  });
  const [loading, setLoading] = useState(isAuthConfigured);

  useEffect(() => {
    if (!isAuthConfigured) {
      setLoading(false);
      return;
    }
    // Older recovery emails targeted Settings. Move their auth payload intact
    // before the SDK consumes it or product guards redirect to login/onboarding.
    if (window.location.pathname === "/settings") {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (
        hash.get("type") === "recovery" ||
        query.has("token") ||
        query.has("error") ||
        hash.has("error")
      ) {
        const target = new URL("/auth/callback", window.location.origin);
        target.searchParams.set("mode", "recovery");
        if (query.has("token")) target.searchParams.set("token", query.get("token")!);
        if (query.has("error")) target.searchParams.set("error", query.get("error")!);
        target.hash = window.location.hash;
        window.location.replace(target.href);
        return;
      }
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
          // Keep previously issued recovery links to /settings usable too.
          if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/auth/callback") {
            window.location.replace("/auth/callback?mode=recovery");
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const requestedRevision = authRevision;
        const sessionResponse = await authClient.getSession();
        if (mounted && sessionResponse.error) setCallbackError(sessionResponse.error.message);
        if (mounted && authRevision === requestedRevision) setSession(sessionResponse.data.session);
      })
      .catch(() => {
        if (!mounted || authRevision > 0) return;
        setCallbackError("Authentication failed");
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
    () => ({ configured: isAuthConfigured, loading, session, callbackError }),
    [loading, session, callbackError],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
