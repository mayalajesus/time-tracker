import { Button } from "@heroui/react/button";
import { Spinner } from "@heroui/react/spinner";
import { Typography } from "@heroui/react/typography";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthPage, ContinueToWorkspaceButton } from "@/components/auth-page";
import { FormAlert } from "@/components/form-feedback";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { createApiDataSource } from "@/lib/api-data-source";
import { useAccountLifecycle } from "@/lib/account-lifecycle-context";

export const Route = createFileRoute("/invite/accept")({ component: InviteAcceptPage });

function InviteAcceptPage() {
  const { configured, session } = useAuth();
  const userId = session?.user.id ?? "";
  const search = useLocation().searchStr;
  const metadataInvitation = session?.user.user_metadata?.["invitation_id"];
  const lifecycle = useAccountLifecycle();
  const canAccept =
    !lifecycle.loading &&
    !lifecycle.error &&
    lifecycle.status?.accountStatus === "active" &&
    lifecycle.status.legal.accepted;
  const { t } = useI18n();
  const dataSource = useMemo(() => createApiDataSource(), []);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestRef = useRef<{
    key: string;
    promise: ReturnType<typeof dataSource.acceptInvitation>;
  } | null>(null);
  const invitationId = useMemo(() => {
    const fromUrl = new URLSearchParams(search).get("invitation");
    return fromUrl ?? (typeof metadataInvitation === "string" ? metadataInvitation : "");
  }, [metadataInvitation, search]);

  useEffect(() => {
    if (!configured || !userId || !canAccept) return;
    if (!invitationId) {
      setErrorMessage("This invitation link is missing or invalid.");
      return;
    }
    let cancelled = false;
    const key = JSON.stringify([userId, invitationId, attempt]);
    // Reuse the in-flight request when React restarts an effect. An explicit
    // retry gets a new key; auth token renewals do not start another acceptance.
    if (requestRef.current?.key !== key) {
      requestRef.current = { key, promise: dataSource.acceptInvitation(invitationId) };
    }
    setBusy(true);
    setErrorMessage(null);
    void requestRef.current.promise.then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setBusy(false);
        setErrorMessage(result.error);
        return;
      }
      window.location.replace("/tracker");
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, canAccept, configured, dataSource, invitationId, userId]);

  return (
    <AuthPage
      title={t("Workspace invitation")}
      description={t("Accept your invitation to collaborate on tracked time.")}
    >
      {!configured ? <ContinueToWorkspaceButton /> : null}
      {configured && userId && lifecycle.error ? (
        <div className="space-y-4">
          <FormAlert title={t("We couldn't load your account")} description={t(lifecycle.error)} />
          <Button isDisabled={lifecycle.loading} onPress={() => void lifecycle.refresh()}>
            {t("Try again")}
          </Button>
        </div>
      ) : null}
      {configured && errorMessage ? (
        <div className="space-y-4">
          <FormAlert
            title={t("We couldn't accept this invitation")}
            description={t(errorMessage)}
          />
          {userId && invitationId ? (
            <Button
              isDisabled={busy || !canAccept}
              onPress={() => setAttempt((value) => value + 1)}
            >
              {t("Try again")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {configured && session ? (
        !errorMessage && !lifecycle.error ? (
          <div className="flex flex-col items-center gap-3 py-5 text-center" role="status">
            <Spinner aria-label={t("Accepting invitation…")} />
            <Typography type="body-sm" color="muted">
              {busy ? t("Accepting invitation…") : t("Preparing your invitation…")}
            </Typography>
          </div>
        ) : null
      ) : configured ? (
        <div className="space-y-4">
          <Typography type="body-sm" color="muted">
            {t("Sign in or create your account to accept this invitation.")}
          </Typography>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="w-full"
              onPress={() => {
                window.location.assign(
                  `/login?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
                );
              }}
            >
              {t("Sign in")}
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              onPress={() => {
                window.location.assign(
                  `/signup?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
                );
              }}
            >
              {t("Create account")}
            </Button>
          </div>
        </div>
      ) : null}
    </AuthPage>
  );
}
