import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const common = readFileSync(
  new URL("../../db/migrations/20260828180000_core.sql", import.meta.url),
  "utf8",
);
const personalWorkspaceRemoval = readFileSync(
  new URL(
    "../../db/migrations/20260918120000_remove_personal_workspace_bootstrap.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabase = readFileSync(
  new URL("../../db/providers/supabase/20260828181000_supabase.sql", import.meta.url),
  "utf8",
);
const productionPersistence = readFileSync(
  new URL("../../db/migrations/20260831130000_production_persistence.sql", import.meta.url),
  "utf8",
);
const productionStorage = readFileSync(
  new URL("../../db/providers/supabase/20260831131000_production_storage.sql", import.meta.url),
  "utf8",
);
const googleOauthProfile = readFileSync(
  new URL("../../db/providers/supabase/20260831140000_google_oauth_profile.sql", import.meta.url),
  "utf8",
);
const workspaceMemberBilling = readFileSync(
  new URL("../../db/migrations/20260831150000_workspace_member_billing.sql", import.meta.url),
  "utf8",
);
const qaSeed = readFileSync(new URL("../../db/seeds/qa/001_demo.sql", import.meta.url), "utf8");

describe("portable database schema", () => {
  it("keeps provider authentication out of the common migrations", () => {
    expect(root).toBeTruthy();
    expect(common).not.toMatch(/\bauth\./i);
    expect(common).not.toMatch(/auth\.uid\s*\(/i);
    expect(common).toMatch(
      /create table if not exists public\.profiles\s*\([\s\S]*?id text primary key/i,
    );
    expect(common).toMatch(/Authentication subject \(sub\)/);
  });

  it("contains the complete shared product model", () => {
    for (const table of [
      "profiles",
      "user_preferences",
      "workspaces",
      "workspace_settings",
      "workspace_members",
      "clients",
      "projects",
      "project_members",
      "workspace_invitations",
      "time_entries",
      "active_timers",
    ]) {
      expect(common).toContain(`create table if not exists public.${table}`);
    }
  });

  it("enforces workspace ownership, valid duration, timer task and timer uniqueness", () => {
    expect(common).toContain("foreign key (client_id, workspace_id)");
    expect(common).toContain("foreign key (workspace_id, user_id)");
    expect(common).toContain("foreign key (project_id, workspace_id)");
    expect(common).toContain("duration_seconds integer not null check (duration_seconds > 0)");
    expect(common).toMatch(/active_timers[\s\S]*?task text not null check/i);
    expect(common).toMatch(/active_timers[\s\S]*?primary key \(user_id, workspace_id\)/i);
  });

  it("indexes the main workspace, user, date and project query paths", () => {
    expect(common).toContain("time_entries_workspace_date_idx");
    expect(common).toContain("time_entries_user_date_idx");
    expect(common).toContain("time_entries_workspace_project_date_idx");
    expect(common).toContain("projects_workspace_idx");
    expect(
      readFileSync(
        new URL("../../db/migrations/20260831110000_report_query_indexes.sql", import.meta.url),
        "utf8",
      ),
    ).toContain("time_entries_workspace_end_date_idx");
  });

  it("maps Supabase users from the verified token subject only in its adapter", () => {
    expect(supabase).toContain("auth.jwt() ->> 'sub'");
    expect(supabase).toContain("new.id::text");
  });

  it("keeps synthetic seeds guarded and exclusive to QA", () => {
    expect(qaSeed).toContain("app.environment");
    expect(qaSeed).toContain("example.test");
    expect(qaSeed).not.toMatch(/@(?:gmail|outlook|hotmail)\./i);
  });

  it("persists production preferences and protects private workspace media", () => {
    expect(productionPersistence).toContain("active_workspace_id uuid");
    expect(productionPersistence).toContain("report_filters jsonb");
    expect(productionPersistence).toContain("logo_path text");
    expect(productionStorage).toContain("'workspace-logos'");
    expect(productionStorage).toContain("public.is_workspace_member");
    expect(productionStorage).toContain("public.is_workspace_owner");
    expect(productionStorage).toMatch(/avatar_select[\s\S]*workspace_members viewer/i);
  });

  it("stores each user's billing rate independently in every workspace", () => {
    expect(workspaceMemberBilling).toMatch(
      /alter table public\.workspace_members[\s\S]*hourly_rate numeric/i,
    );
    expect(workspaceMemberBilling).toMatch(/workspace_members[\s\S]*currency text/i);
    expect(workspaceMemberBilling).toMatch(
      /from public\.user_preferences up[\s\S]*up\.user_id = wm\.user_id/i,
    );
  });

  it("creates Google accounts with provider profile data without replacing custom photos", () => {
    expect(googleOauthProfile).toContain("given_name");
    expect(googleOauthProfile).toContain("family_name");
    expect(googleOauthProfile).toContain("googleusercontent");
    expect(googleOauthProfile).toMatch(/avatar_data_url[\s\S]*heroui-assets/i);
  });

  it("stops creating personal workspaces without changing existing workspace data", () => {
    expect(personalWorkspaceRemoval).toMatch(
      /drop trigger if exists on_profile_created on public\.profiles/i,
    );
    expect(personalWorkspaceRemoval).toMatch(
      /drop function if exists public\.handle_new_profile_workspace\(\)/i,
    );
    expect(personalWorkspaceRemoval).toMatch(
      /drop function if exists public\.ensure_personal_workspace\(text\)/i,
    );
    expect(personalWorkspaceRemoval).not.toMatch(/delete\s+from\s+public\.workspaces/i);
    expect(personalWorkspaceRemoval).not.toMatch(/update\s+public\.workspaces/i);
  });
});
