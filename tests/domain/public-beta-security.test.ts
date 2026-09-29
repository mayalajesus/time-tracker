import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  enforceIpBurstLimit,
  enforceUserRateLimits,
  rateLimitScopes,
  resetIpRateLimitsForTests,
} from "../../server/rate-limit.mjs";
import { sanitizeTelemetry } from "../../server/observability.mjs";
import { hasBearerSecret } from "../../server/request-security.mjs";
import {
  cancelAccountDeletion,
  enforceAccountLifecycle,
  exportAccountData,
  processDueAccountDeletions,
  requestAccountDeletion,
  transferWorkspaceOwnership,
} from "../../server/account-lifecycle.mjs";

const migration = readFileSync(
  new URL("../../db/migrations/20260903120000_public_beta_readiness.sql", import.meta.url),
  "utf8",
);
const auth = readFileSync(new URL("../../src/lib/auth.ts", import.meta.url), "utf8");
const signup = readFileSync(new URL("../../src/routes/signup.tsx", import.meta.url), "utf8");
const clientObservability = readFileSync(
  new URL("../../src/lib/observability.ts", import.meta.url),
  "utf8",
);
const serverObservability = readFileSync(
  new URL("../../server/observability.mjs", import.meta.url),
  "utf8",
);

describe("public beta protection", () => {
  it("classifies persistent operation windows with the approved limits", () => {
    expect(rateLimitScopes("loadAccount")).toEqual([
      { scope: "general", limit: 180, windowMs: 60_000 },
      { scope: "read", limit: 120, windowMs: 60_000 },
    ]);
    expect(rateLimitScopes("syncAccount")[1]).toMatchObject({ scope: "sync", limit: 30 });
    expect(rateLimitScopes("createInvitationLink")[1]).toMatchObject({
      scope: "sensitive",
      limit: 10,
    });
    expect(rateLimitScopes("createWorkspace")[1]).toMatchObject({
      scope: "sensitive",
      limit: 10,
    });
    expect(rateLimitScopes("syncAccount", { includesUpload: true })).toEqual([
      { scope: "general", limit: 180, windowMs: 60_000 },
      { scope: "sync", limit: 30, windowMs: 60_000 },
      { scope: "sensitive", limit: 10, windowMs: 3_600_000 },
    ]);
    expect(rateLimitScopes("exportAccountData")[1]).toMatchObject({
      scope: "export",
      limit: 2,
    });
  });

  it("rejects a per-instance IP burst without persisting the address", () => {
    resetIpRateLimitsForTests();
    const request = { headers: { "x-forwarded-for": "203.0.113.7" } };
    for (let index = 0; index < 240; index += 1) enforceIpBurstLimit(request as never, 1_000);
    expect(() => enforceIpBurstLimit(request as never, 1_000)).toThrowError(
      expect.objectContaining({ status: 429, code: "rate_limit_exceeded", retryAfter: 60 }),
    );
  });

  it("returns Retry-After data when an atomic database bucket exceeds its limit", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [{ request_count: 181, window_started_at: new Date("2026-09-03T12:00:00Z") }],
      }),
    };
    await expect(
      enforceUserRateLimits(client, "user-1", "saveActiveTimer", new Date("2026-09-03T12:00:30Z")),
    ).rejects.toMatchObject({ status: 429, code: "rate_limit_exceeded", retryAfter: 30 });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("removes PII and sensitive application fields from nested telemetry", () => {
    expect(
      sanitizeTelemetry({
        request: { headers: { authorization: "Bearer secret" }, url: "https://signed.example" },
        user: { email: "person@example.com", id: "safe-id" },
        extra: { task: "Private task", description: "Private notes", count: 2 },
      }),
    ).toEqual({
      request: { headers: { authorization: "[Filtered]" }, url: "[Filtered]" },
      user: { email: "[Filtered]", id: "safe-id" },
      extra: { task: "[Filtered]", description: "[Filtered]", count: 2 },
    });
    for (const source of [clientObservability, serverObservability]) {
      expect(source).toContain("sendDefaultPii: false");
      expect(source).toContain("tracesSampleRate: 0.1");
      expect(source).toContain("beforeSendTransaction");
      expect(source).toContain("beforeBreadcrumb");
    }
  });

  it("compares operational bearer secrets without accepting near matches", () => {
    expect(
      hasBearerSecret({ headers: { authorization: "Bearer correct" } } as never, "correct"),
    ).toBe(true);
    expect(
      hasBearerSecret({ headers: { authorization: "Bearer correcx" } } as never, "correct"),
    ).toBe(false);
    expect(hasBearerSecret({ headers: {} } as never, "correct")).toBe(false);
  });

  it("passes CAPTCHA tokens only to email authentication operations", () => {
    expect(auth).toContain("captchaToken");
    expect(signup).toContain("TurnstileChallenge");
    expect(auth).not.toMatch(/signInWithOAuth[\s\S]{0,220}captchaToken/);
  });

  it("persists server-only lifecycle tables behind RLS", () => {
    for (const table of ["api_rate_limits", "legal_acceptances", "account_deletion_requests"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("account_status in ('active', 'deletion_pending')");
  });
});

describe("account lifecycle authorization", () => {
  it("transfers ownership only to an active member and demotes the previous owner", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: "owner-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValue({ rowCount: 1, rows: [] });
    await expect(
      transferWorkspaceOwnership({ query }, "owner-1", {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        targetUserId: "member-2",
      }),
    ).resolves.toEqual({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      ownerId: "member-2",
    });
    expect(query.mock.calls[2]?.[0]).toContain("set role = 'Admin'");
    expect(query.mock.calls[3]?.[0]).toContain("set role = 'Owner'");
    expect(query.mock.calls[4]?.[0]).toContain("update public.workspaces");
  });

  it("blocks deletion without recent authentication", async () => {
    await expect(
      requestAccountDeletion(
        { query: vi.fn() },
        { id: "user-1", email: "person@example.com", authenticatedAt: Date.now() - 11 * 60_000 },
        { confirmation: "person@example.com" },
      ),
    ).rejects.toMatchObject({ status: 401, code: "recent_authentication_required" });
  });

  it("blocks deletion while a shared workspace is still owned", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ name: "Shared" }] });
    await expect(
      requestAccountDeletion(
        { query },
        { id: "user-1", email: "person@example.com", authenticatedAt: Date.now() },
        { confirmation: "person@example.com" },
      ),
    ).rejects.toMatchObject({ status: 409, code: "workspace_ownership_transfer_required" });
  });

  it("restricts a pending account to cancellation, status and export", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ account_status: "deletion_pending", legal_accepted: true }],
      }),
    };
    await expect(enforceAccountLifecycle(client, "user-1", "loadAccount")).rejects.toMatchObject({
      status: 423,
      code: "account_deletion_pending",
    });
    await expect(
      enforceAccountLifecycle(client, "user-1", "cancelAccountDeletion"),
    ).resolves.toBeUndefined();
    await expect(
      enforceAccountLifecycle(client, "user-1", "exportAccountData"),
    ).resolves.toBeUndefined();
  });

  it("cancels the pending request and restores access immediately", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "deletion-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await expect(cancelAccountDeletion({ query }, "user-1")).resolves.toBeNull();
    expect(query.mock.calls[0]?.[0]).toContain("status in ('pending', 'failed')");
    expect(query.mock.calls[1]?.[0]).toContain("set account_status = 'active'");
  });

  it("exports only records selected with the authenticated subject", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    await exportAccountData({ query }, { id: "user-1", email: "person@example.com" });
    expect(query).toHaveBeenCalledTimes(5);
    for (const call of query.mock.calls) expect(call[1]).toContain("user-1");
    expect(query.mock.calls[3]?.[1]).toEqual(["user-1", "person@example.com"]);
    expect(query.mock.calls[4]?.[0]).toContain("where user_id = $1");
  });

  it("processes an expired deletion once and then becomes idempotent", async () => {
    const request = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-1",
    };
    const client = {
      query: vi.fn(async (sql: string, _parameters?: unknown[]) => {
        if (sql.includes("select profile.avatar_path")) return { rowCount: 0, rows: [] };
        if (sql.includes("select w.name from public.workspaces")) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("select distinct entry.workspace_id")) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [] };
      }),
      release: vi.fn(),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [request] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: request.id }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const pool = { query, connect: vi.fn().mockResolvedValue(client) };

    await expect(processDueAccountDeletions(pool, null)).resolves.toEqual({
      selected: 1,
      completed: 1,
      failed: 0,
    });
    await expect(processDueAccountDeletions(pool, null)).resolves.toEqual({
      selected: 0,
      completed: 0,
      failed: 0,
    });
    expect(query.mock.calls[0]?.[0]).toContain("execute_after <= now()");
    expect(query.mock.calls[2]?.[0]).toContain("status = 'completed'");
  });

  it("pseudonymizes shared time records before removing the original profile", async () => {
    const request = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "user-1",
    };
    const client = {
      query: vi.fn(async (sql: string, _parameters?: unknown[]) => {
        if (sql.includes("select profile.avatar_path")) return { rowCount: 0, rows: [] };
        if (sql.includes("select w.name from public.workspaces")) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("select distinct entry.workspace_id")) {
          return {
            rowCount: 1,
            rows: [{ workspace_id: "33333333-3333-4333-8333-333333333333" }],
          };
        }
        return { rowCount: 1, rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [request] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: request.id }] })
        .mockResolvedValue({ rowCount: 1, rows: [] }),
    };

    await expect(processDueAccountDeletions(pool, null)).resolves.toMatchObject({ completed: 1 });
    const statements = client.query.mock.calls.map((call) => call[0]).join("\n");
    expect(statements).toContain("'deleted', 'Usuário excluído'");
    expect(statements).toContain("update public.time_entries entry set user_id = $2");
    expect(client.query.mock.calls.some((call) => call[1]?.includes(`deleted:${request.id}`))).toBe(
      true,
    );
  });

  it("records a failed deletion so the daily job can retry it", async () => {
    const request = {
      id: "44444444-4444-4444-8444-444444444444",
      user_id: "user-1",
    };
    const client = {
      query: vi.fn().mockRejectedValue(new Error("temporary storage failure")),
      release: vi.fn(),
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [request] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: request.id }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const pool = { query, connect: vi.fn().mockResolvedValue(client) };

    await expect(processDueAccountDeletions(pool, null)).resolves.toEqual({
      selected: 1,
      completed: 0,
      failed: 1,
    });
    expect(query.mock.calls[2]?.[0]).toContain("failure_count = failure_count + 1");
    expect(query.mock.calls[2]?.[1]).toEqual([request.id, "temporary storage failure"]);
  });
});
