import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createApiDataSource } from "./api-data-source";
import type { AccountDeletionStatus } from "./account-data-source";
import { useAuth } from "./auth-context";
import type { Locale } from "./i18n";

type AccountLifecycleValue = {
  loading: boolean;
  error: string | null;
  status: AccountDeletionStatus | null;
  refresh: () => Promise<void>;
  acceptLegalTerms: (
    locale: Locale,
  ) => Promise<{ success: true } | { success: false; error: string }>;
  cancelDeletion: () => Promise<{ success: true } | { success: false; error: string }>;
};

const AccountLifecycleContext = createContext<AccountLifecycleValue | null>(null);

export function AccountLifecycleProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session } = useAuth();
  const userId = session?.user.id ?? "";
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const requestRevision = useRef(0);
  const [loadedUserId, setLoadedUserId] = useState("");
  const dataSource = useMemo(() => createApiDataSource(), []);
  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current;
    if (!userId) {
      setStatus(null);
      setError(null);
      setLoading(false);
      setLoadedUserId("");
      return;
    }
    setLoading(true);
    const result = await dataSource.getAccountDeletionStatus();
    if (userIdRef.current !== userId || revision !== requestRevision.current) return;
    setLoadedUserId(userId);
    setLoading(false);
    if (!result.success) {
      setStatus(null);
      setError(result.error);
      return;
    }
    setStatus(result.data);
    setError(null);
  }, [dataSource, userId]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
    return () => {
      requestRevision.current += 1;
    };
  }, [authLoading, refresh]);

  const value = useMemo<AccountLifecycleValue>(
    () => ({
      // Fail closed during the render between Auth resolving and the lifecycle
      // request effect starting, so protected content never flashes briefly.
      loading:
        authLoading ||
        Boolean(userId && (loadedUserId !== userId || (!status && !error))) ||
        loading,
      error: loadedUserId === userId ? error : null,
      status: loadedUserId === userId ? status : null,
      refresh,
      acceptLegalTerms: async (locale) => {
        const revision = ++requestRevision.current;
        const result = await dataSource.acceptLegalTerms(locale);
        if (userIdRef.current !== userId || revision !== requestRevision.current)
          return { success: false, error: "Your account session changed. Try again." };
        setLoading(false);
        if (!result.success) return result;
        setLoadedUserId(userId);
        setStatus(result.data);
        setError(null);
        return { success: true };
      },
      cancelDeletion: async () => {
        const revision = ++requestRevision.current;
        const result = await dataSource.cancelAccountDeletion();
        if (userIdRef.current !== userId || revision !== requestRevision.current)
          return { success: false, error: "Your account session changed. Try again." };
        setLoading(false);
        if (!result.success) return result;
        await refresh();
        return { success: true };
      },
    }),
    [authLoading, dataSource, error, loadedUserId, loading, refresh, status, userId],
  );

  return (
    <AccountLifecycleContext.Provider value={value}>{children}</AccountLifecycleContext.Provider>
  );
}

export function useAccountLifecycle() {
  const context = useContext(AccountLifecycleContext);
  if (!context) throw new Error("useAccountLifecycle must be used inside AccountLifecycleProvider");
  return context;
}
