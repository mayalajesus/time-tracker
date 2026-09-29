import type { Session } from "@supabase/supabase-js";
import { getAuthClient, type AuthClient } from "./auth-client";
import { getAuthRedirect } from "./supabase";
import { getAuthReturnPath } from "./auth-redirect";

export type AuthResult<T = undefined> =
  { success: true; data?: T } | { success: false; error: string };

function getError(error: { message: string } | null): AuthResult<never> | null {
  return error ? { success: false, error: error.message } : null;
}

function emailOperationError(error: { message: string } | null): AuthResult<never> | null {
  if (!error) return null;
  if (/rate.?limit|quota|too many|over_email_send_rate_limit/i.test(error.message)) {
    return {
      success: false,
      error: "Email delivery is temporarily limited. Try again later or continue with Google.",
    };
  }
  if (/captcha|turnstile|security verification/i.test(error.message)) {
    return { success: false, error: "Security verification failed. Try again." };
  }
  return getError(error);
}

async function requireClient(): Promise<AuthClient | null> {
  try {
    return await getAuthClient();
  } catch {
    return null;
  }
}

function unavailable(): AuthResult<never> {
  return { success: false, error: "Authentication is currently unavailable." };
}

export async function signInWithPassword(
  email: string,
  password: string,
  captchaToken?: string,
  rememberMe = true,
): Promise<AuthResult<Session>> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  let response;
  try {
    response = await authClient.signInWithPassword({
      email,
      password,
      rememberMe,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to sign in." };
  }
  const failure = emailOperationError(response.error);
  return (
    failure ??
    (response.data.session ? { success: true, data: response.data.session } : { success: true })
  );
}

export async function signUpWithPassword(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  captchaToken?: string,
): Promise<AuthResult<Session>> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  const name = `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ");
  const redirect = new URL(getAuthRedirect());
  redirect.searchParams.set("redirect", getAuthReturnPath());
  const response = await authClient.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirect.toString(),
      data: { name, displayName: name, firstName: firstName.trim(), lastName: lastName.trim() },
      ...(captchaToken ? { captchaToken } : {}),
    },
  });
  const failure = emailOperationError(response.error);
  return (
    failure ??
    (response.data.session ? { success: true, data: response.data.session } : { success: true })
  );
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  const redirect = new URL(getAuthRedirect());
  redirect.searchParams.set("redirect", getAuthReturnPath());
  const { error } = await authClient.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirect.toString() },
  });
  return getError(error) ?? { success: true };
}

export async function signOut(): Promise<AuthResult> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  const { error } = await authClient.signOut();
  return getError(error) ?? { success: true };
}

export async function requestPasswordReset(
  email: string,
  captchaToken?: string,
): Promise<AuthResult> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  const { error } = await authClient.resetPasswordForEmail(email, {
    redirectTo: getAuthRedirect("/settings"),
    ...(captchaToken ? { captchaToken } : {}),
  });
  return emailOperationError(error) ?? { success: true };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  const { error } = await authClient.updateUser({ password });
  return getError(error) ?? { success: true };
}

export async function updateEmail(email: string): Promise<AuthResult> {
  const authClient = await requireClient();
  if (!authClient) return unavailable();
  const { error } = await authClient.updateUser({ email });
  return getError(error) ?? { success: true };
}
