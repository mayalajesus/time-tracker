import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { authStorage, setRememberSession } from "./auth-storage";
import {
  authProvider,
  isSupabaseConfigured,
  neonAuthUrl,
  supabasePublishableKey,
  supabaseUrl,
} from "./supabase";

type ErrorLike = { message: string } | null;
type SessionResponse = { data: { session: Session | null }; error: ErrorLike };
type AuthResponse = { data: { session: Session | null }; error: ErrorLike };
type AuthSubscription = {
  data: { subscription: { unsubscribe: () => void } };
};
type AuthStateCallback = (event: AuthChangeEvent, session: Session | null) => void;

export type AuthClient = {
  getJWTToken?: () => Promise<string | null>;
  getSession: () => Promise<SessionResponse>;
  onAuthStateChange: (callback: AuthStateCallback) => AuthSubscription;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
    rememberMe?: boolean;
    options?: { captchaToken?: string };
  }) => Promise<AuthResponse>;
  signUp: (credentials: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, string>; captchaToken?: string };
  }) => Promise<AuthResponse>;
  signInWithOAuth: (options: {
    provider: "google";
    options?: { redirectTo?: string };
  }) => Promise<{ error: ErrorLike }>;
  signOut: () => Promise<{ error: ErrorLike }>;
  resetPasswordForEmail: (
    email: string,
    options: { redirectTo?: string; captchaToken?: string },
  ) => Promise<{ error: ErrorLike }>;
  updateUser: (attributes: { password?: string; email?: string }) => Promise<{ error: ErrorLike }>;
};

export const isAuthConfigured =
  isSupabaseConfigured || Boolean(authProvider === "neon" && neonAuthUrl);

let clientPromise: Promise<AuthClient | null> | null = null;

async function createConfiguredClient(): Promise<AuthClient | null> {
  if (!isAuthConfigured) return null;

  if (authProvider === "supabase") {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        storage: authStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return {
      getSession: () => supabase.auth.getSession(),
      getJWTToken: () => Promise.resolve(null),
      onAuthStateChange: (callback) => supabase.auth.onAuthStateChange(callback),
      signInWithPassword: ({ rememberMe = true, ...credentials }) => {
        setRememberSession(rememberMe);
        return supabase.auth.signInWithPassword(credentials);
      },
      signUp: (credentials) => supabase.auth.signUp(credentials),
      signInWithOAuth: (options) => supabase.auth.signInWithOAuth(options),
      signOut: () => supabase.auth.signOut(),
      resetPasswordForEmail: (email, options) =>
        supabase.auth.resetPasswordForEmail(email, options),
      updateUser: (attributes) => supabase.auth.updateUser(attributes),
    };
  }

  const [{ createAuthClient }, { SupabaseAuthAdapter }] = await Promise.all([
    import("@neondatabase/auth"),
    import("@neondatabase/auth/vanilla/adapters"),
  ]);
  const neonAuth = createAuthClient(neonAuthUrl, { adapter: SupabaseAuthAdapter() });
  return {
    getSession: () => neonAuth.getSession() as unknown as Promise<SessionResponse>,
    getJWTToken: () => neonAuth.getJWTToken(false),
    onAuthStateChange: (callback) =>
      neonAuth.onAuthStateChange(callback) as unknown as AuthSubscription,
    signInWithPassword: async ({ rememberMe = true, ...credentials }) => {
      if (rememberMe)
        return neonAuth.signInWithPassword(credentials) as unknown as Promise<AuthResponse>;
      const result = await neonAuth.getBetterAuthInstance().signIn.email({
        email: credentials.email,
        password: credentials.password,
        rememberMe: false,
      });
      if (result.error)
        return {
          data: { session: null },
          error: { message: result.error.message ?? "Unable to sign in." },
        };
      return neonAuth.getSession() as unknown as Promise<AuthResponse>;
    },
    signUp: (credentials) => neonAuth.signUp(credentials) as unknown as Promise<AuthResponse>,
    signInWithOAuth: (options) =>
      neonAuth.signInWithOAuth(options) as unknown as Promise<{ error: ErrorLike }>,
    signOut: () => neonAuth.signOut() as unknown as Promise<{ error: ErrorLike }>,
    resetPasswordForEmail: (email, options) =>
      neonAuth.resetPasswordForEmail(email, options) as unknown as Promise<{
        error: ErrorLike;
      }>,
    updateUser: (attributes) =>
      neonAuth.updateUser(attributes) as unknown as Promise<{ error: ErrorLike }>,
  };
}

export function getAuthClient(): Promise<AuthClient | null> {
  clientPromise ??= createConfiguredClient();
  return clientPromise;
}
