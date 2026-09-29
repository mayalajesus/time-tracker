import { Button } from "@heroui/react/button";
import { Checkbox } from "@heroui/react/checkbox";
import { Label } from "@heroui/react/label";
import { Form } from "@heroui/react/form";
import { Link } from "@heroui/react/link";
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
import { signInWithGoogle, signInWithPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { isTurnstileConfigured, TurnstileChallenge } from "@/components/turnstile";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { session } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  useEffect(() => {
    if (session) window.location.replace(getAuthReturnPath());
  }, [session]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await signInWithPassword(
      email.trim(),
      password,
      captchaToken ?? undefined,
      rememberMe,
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      setCaptchaToken(null);
      setCaptchaResetKey((value) => value + 1);
      return;
    }
    window.location.replace(getAuthReturnPath());
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
    <AuthPage title={t("Sign in")} description={t("Access your time tracking workspace.")}>
      <AuthError message={error} />
      <GoogleAuthButton onPress={continueWithGoogle} isDisabled={busy} />
      <AuthDivider />
      <Form className="flex flex-col gap-5" onSubmit={submit}>
        <AuthField
          id="login-email"
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
          id="login-password"
          allowPasswordToggle
          label={t("Password")}
          type="password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setError(null);
          }}
          autoComplete="current-password"
          placeholder={t("Enter your password")}
          validate={(value) => (value ? null : t("Password is required"))}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            name="remember-me"
            isSelected={rememberMe}
            onChange={setRememberMe}
            isDisabled={busy}
          >
            <Checkbox.Content className="items-center gap-2">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Label>{t("Remember me")}</Label>
            </Checkbox.Content>
          </Checkbox>
          <Link href="/forgot-password">{t("Forgot password?")}</Link>
        </div>
        {isTurnstileConfigured ? (
          <TurnstileChallenge onToken={setCaptchaToken} resetKey={captchaResetKey} />
        ) : null}
        <Button
          className="w-full"
          type="submit"
          isDisabled={busy || (isTurnstileConfigured && !captchaToken)}
        >
          {busy ? t("Signing in…") : t("Sign in")}
        </Button>
      </Form>
      <AuthFooter prompt={t("Don't have an account?")} to="/signup" action={t("Create account")} />
    </AuthPage>
  );
}
