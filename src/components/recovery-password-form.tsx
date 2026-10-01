import { useRef, useState } from "react";
import { Button } from "@heroui/react/button";
import { Form } from "@heroui/react/form";
import { AuthError, AuthField } from "./auth-page";
import { updatePassword } from "@/lib/auth";
import { getAuthReturnPath } from "@/lib/auth-redirect";
import { passwordRequirements } from "@/lib/password-policy";
import { useI18n } from "@/lib/i18n";

export function RecoveryPasswordForm({ recoveryToken }: { recoveryToken?: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const unmet = passwordRequirements.find((rule) => !rule.meets(password));
    if (unmet) {
      setError(unmet.error);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await updatePassword(password, recoveryToken);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPassword("");
      setConfirmation("");
      window.location.replace(recoveryToken ? "/login" : getAuthReturnPath());
    } catch {
      setError("Unable to update your password. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Form onSubmit={submit} className="flex flex-col gap-5">
      <AuthError message={error} />
      <AuthField
        id="recovery-password"
        label={t("Password")}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        allowPasswordToggle
      />
      <ul className="text-sm text-muted">
        {passwordRequirements.map((rule) => (
          <li key={rule.label} className={rule.meets(password) ? "text-success" : ""}>
            {rule.meets(password) ? "✓ " : "• "}
            {t(rule.label)}
          </li>
        ))}
      </ul>
      <AuthField
        id="recovery-confirmation"
        label={t("Confirm password")}
        type="password"
        value={confirmation}
        onChange={setConfirmation}
        autoComplete="new-password"
        allowPasswordToggle
      />
      <Button type="submit" isDisabled={busy}>
        {busy ? t("Saving…") : t("Save new password")}
      </Button>
      {error ? (
        <Button
          variant="ghost"
          isDisabled={busy}
          onPress={() => window.location.replace("/forgot-password")}
        >
          {t("Send reset link")}
        </Button>
      ) : null}
    </Form>
  );
}
