import { Button } from "@heroui/react/button";
import { Form } from "@heroui/react/form";
import { Typography } from "@heroui/react/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AuthDivider,
  AuthError,
  AuthField,
  AuthFooter,
  AuthPage,
  GoogleAuthButton,
} from "@/components/auth-page";
import { signInWithGoogle, signUpWithPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { isTurnstileConfigured, TurnstileChallenge } from "@/components/turnstile";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (session) window.location.replace(getAuthReturnPath());
  }, [session]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const normalizedFirstName = firstName.trim().replace(/\s+/g, " ");
    const normalizedLastName = lastName.trim().replace(/\s+/g, " ");
    if (!normalizedFirstName) {
      setError("A first name is required.");
      return;
    }
    if (!normalizedLastName) {
      setError("A last name is required.");
      return;
    }
    if (`${normalizedFirstName} ${normalizedLastName}`.length > 120) {
      setError("Name must be 120 characters or fewer.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least one uppercase letter.");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least one number.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const result = await signUpWithPassword(
      normalizedEmail,
      password,
      normalizedFirstName,
      normalizedLastName,
      captchaToken ?? undefined,
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      setCaptchaToken(null);
      setCaptchaResetKey((value) => value + 1);
      return;
    }
    setCreated(true);
  };

  const continueWithGoogle = async () => {
    setError(null);
    setBusy(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      setBusy(false);
      setError(result.error);
    }
  };

  return (
    <AuthPage
      title={t("Create your account")}
      description={t("Create an account to join your company or start a new workspace.")}
    >
      <AuthError message={error} />
      {created ? (
        <div className="space-y-4" role="status">
          <Typography type="body-sm" color="muted">
            {t("Check your email to confirm your account before signing in.")}
          </Typography>
          <Button
            className="w-full"
            onPress={() =>
              window.location.assign(`/login?redirect=${encodeURIComponent(getAuthReturnPath())}`)
            }
          >
            {t("Back to sign in")}
          </Button>
        </div>
      ) : (
        <>
          <GoogleAuthButton onPress={continueWithGoogle} isDisabled={busy} />
          <AuthDivider />
          <Form className="space-y-4" onSubmit={submit}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <AuthField
                id="signup-first-name"
                label={t("First name")}
                value={firstName}
                onChange={(value) => {
                  setFirstName(value);
                  setError(null);
                }}
                autoComplete="given-name"
                placeholder={t("Your first name")}
                validate={(value) => (value.trim() ? null : t("A first name is required."))}
              />
              <AuthField
                id="signup-last-name"
                label={t("Last name")}
                value={lastName}
                onChange={(value) => {
                  setLastName(value);
                  setError(null);
                }}
                autoComplete="family-name"
                placeholder={t("Your last name")}
                validate={(value) => (value.trim() ? null : t("A last name is required."))}
              />
            </div>
            <AuthField
              id="signup-email"
              label={t("Email")}
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setError(null);
              }}
              autoComplete="email"
              placeholder="john@example.com"
              validate={(value) => {
                if (!value.trim()) return t("Email is required");
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
                  ? null
                  : t("Enter a valid email address");
              }}
            />
            <AuthField
              id="signup-password"
              label={t("Password")}
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError(null);
              }}
              autoComplete="new-password"
              placeholder={t("Enter your password")}
              minLength={8}
              description={t("Use at least 8 characters, one uppercase letter and one number.")}
              validate={(value) => {
                if (value.length < 8) return t("Password must be at least 8 characters.");
                if (!/[A-Z]/.test(value))
                  return t("Password must contain at least one uppercase letter.");
                if (!/[0-9]/.test(value)) return t("Password must contain at least one number.");
                return null;
              }}
            />
            <AuthField
              id="signup-confirmation"
              label={t("Confirm password")}
              type="password"
              value={confirmation}
              onChange={(value) => {
                setConfirmation(value);
                setError(null);
              }}
              autoComplete="new-password"
              placeholder={t("Confirm your password")}
              validate={(value) => (value === password ? null : t("Passwords do not match."))}
            />
            <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
            <Button
              className="w-full"
              type="submit"
              isDisabled={busy || (isTurnstileConfigured && !captchaToken)}
            >
              {busy ? t("Creating account…") : t("Create account")}
            </Button>
          </Form>
          <AuthFooter prompt={t("Already have an account?")} to="/login" action={t("Sign in")} />
        </>
      )}
    </AuthPage>
  );
}
