import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Typography } from "@heroui/react/typography";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { useAccountLifecycle } from "@/lib/account-lifecycle-context";
import { signOut } from "@/lib/auth";

export const Route = createFileRoute("/account-deletion")({ component: AccountDeletionPage });

function AccountDeletionPage() {
  const navigate = useNavigate();
  const { status, cancelDeletion } = useAccountLifecycle();
  const [action, setAction] = useState<"cancel" | "sign-out" | null>(null);
  const actionInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const executeAfter = status?.deletion?.executeAfter
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
        new Date(status.deletion.executeAfter),
      )
    : null;

  const cancel = async () => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setAction("cancel");
    setError(null);
    try {
      const result = await cancelDeletion();
      if (!result.success) {
        setError(result.error);
        return;
      }
      void navigate({ to: "/tracker", replace: true });
    } catch {
      setError("Não foi possível cancelar a exclusão. Tente novamente.");
    } finally {
      actionInFlight.current = false;
      setAction(null);
    }
  };

  const leave = async () => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setAction("sign-out");
    setError(null);
    try {
      const result = await signOut();
      if (!result.success) {
        setError("Não foi possível sair da conta. Tente novamente.");
        return;
      }
      window.location.replace("/login");
    } catch {
      setError("Não foi possível sair da conta. Tente novamente.");
    } finally {
      actionInFlight.current = false;
      setAction(null);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg space-y-5 p-6 text-center">
        <div className="space-y-2">
          <Typography type="h1" weight="semibold">
            Conta agendada para exclusão
          </Typography>
          <Typography type="body-sm" color="muted">
            {executeAfter
              ? `A exclusão definitiva está prevista para ${executeAfter}. Até lá, você pode cancelar a exclusão ou sair para acessar outra conta.`
              : "Sua conta está na janela de cancelamento da exclusão."}
          </Typography>
        </div>
        {error ? <FormAlert title="Não foi possível concluir a ação" description={error} /> : null}
        <Button
          isPending={action === "cancel"}
          isDisabled={action !== null}
          onPress={() => void cancel()}
        >
          Cancelar exclusão e restaurar acesso
        </Button>
        <Button
          variant="secondary"
          isPending={action === "sign-out"}
          isDisabled={action !== null}
          onPress={() => void leave()}
        >
          Sair da conta
        </Button>
      </Card>
    </main>
  );
}
