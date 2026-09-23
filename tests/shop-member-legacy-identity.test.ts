import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";

// Codex review on #1731 found that is_shop_member()/shop_role(), as
// recorded by that reconciliation from what a manual production hotfix had
// already applied, join shop_members to profiles on
// "pr.user_id = sm.user_id" and then require "sm.user_id = auth.uid()".
// Every write path into shop_members (the trg_profiles_sync_shop_membership
// trigger, the canonical-membership backfill, and the owner bootstrap
// functions) actually inserts shop_members.user_id = profiles.id, not
// profiles.user_id -- so for an imported/legacy profile where id and
// user_id differ (auth.uid() = user_id), that join never matches and both
// functions wrongly deny a real member. This file covers the fix in
// 20260923174335_fix_shop_member_legacy_identity.sql: joining on
// pr.id = sm.user_id (the invariant those write paths actually maintain)
// and checking the caller against either supported profile identity
// column, matching current_shop_id()'s already-established pattern.

const migrationPath = "supabase/migrations/20260923174335_fix_shop_member_legacy_identity.sql";

function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
  if (start === -1) throw new Error(`${functionName} not found in ${migrationPath}`);
  const nextFunction = source.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe("is_shop_member()/shop_role() — legacy-identity join fix (SQL contract)", () => {
  const source = readFileSync(migrationPath, "utf8");

  it("joins shop_members to profiles on the invariant those tables' write paths actually maintain", () => {
    const isShopMember = extractFunctionBody(source, "is_shop_member");
    const shopRole = extractFunctionBody(source, "shop_role");

    for (const body of [isShopMember, shopRole]) {
      expect(body).toContain("pr.id = sm.user_id");
      expect(body).not.toMatch(/pr\.user_id\s*=\s*sm\.user_id/);
    }
  });

  it("checks the calling user against either supported profile identity column", () => {
    const isShopMember = extractFunctionBody(source, "is_shop_member");
    const shopRole = extractFunctionBody(source, "shop_role");

    for (const body of [isShopMember, shopRole]) {
      expect(body).toContain("pr.id = auth.uid() or pr.user_id = auth.uid()");
      expect(body).not.toMatch(/sm\.user_id\s*=\s*auth\.uid\(\)/);
    }
  });

  it("preserves the demo-access expiry condition PR 1 and its follow-up added", () => {
    const isShopMember = extractFunctionBody(source, "is_shop_member");
    const shopRole = extractFunctionBody(source, "shop_role");

    for (const body of [isShopMember, shopRole]) {
      expect(body).toContain(
        "pr.demo_access_expires_at is null or pr.demo_access_expires_at > now()",
      );
    }
  });

  it("preserves each function's signature, language, and security characteristics", () => {
    const isShopMember = extractFunctionBody(source, "is_shop_member");
    expect(isShopMember).toContain("is_shop_member(p_shop uuid)");
    expect(isShopMember).toContain("RETURNS boolean");
    expect(isShopMember).toContain("LANGUAGE sql");
    expect(isShopMember).toContain("STABLE");
    expect(isShopMember).toContain("SET search_path TO 'public, extensions, pg_temp'");
    expect(isShopMember).not.toContain("SECURITY DEFINER");

    const shopRole = extractFunctionBody(source, "shop_role");
    expect(shopRole).toContain("shop_role(shop_id uuid)");
    expect(shopRole).toContain("RETURNS text");
    expect(shopRole).toContain("LANGUAGE sql");
    expect(shopRole).toContain("STABLE SECURITY DEFINER");
    expect(shopRole).toContain("SET search_path TO 'public', 'pg_temp'");
  });
});

// Runtime database contract: opt-in via SHOP_MEMBER_FIX_TEST_DATABASE_URL,
// skipped otherwise (including CI), matching the established convention
// from tests/parts/parts-lifecycle-db.integration.test.ts and
// tests/demo-shop-current-shop-context-expiry.test.ts.
const databaseUrl = process.env.SHOP_MEMBER_FIX_TEST_DATABASE_URL;
const hasPsql = spawnSync("psql", ["--version"]).status === 0;
const describeDb = databaseUrl && hasPsql ? describe : describe.skip;

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const LEGACY_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const LEGACY_AUTH_UID = "33333333-3333-4333-8333-333333333333";
const NORMAL_PROFILE_ID = "44444444-4444-4444-8444-444444444444";
const EXPIRED_PROFILE_ID = "66666666-6666-4666-8666-666666666666";
const UNRELATED_UID = "55555555-5555-4555-8555-555555555555";

function psql(sql: string): string {
  const result = spawnSync("psql", [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`psql failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout;
}

// A blanket .filter(Boolean)/.trim() here would silently discard a
// genuinely empty last value (e.g. shop_role() returning NULL -> ""),
// mistaking it for a blank line to skip rather than the real result.
// Only the single trailing newline every psql statement result ends with
// is stripped before splitting.
function lastLine(output: string): string {
  const withoutTrailingNewline = output.replace(/\n$/, "");
  const lines = withoutTrailingNewline.split("\n");
  return lines[lines.length - 1] ?? "";
}

const fixtureSqlBeforeMigration = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.current_uid', true), '')::uuid
$$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
grant usage on schema auth to authenticated;

create table if not exists public.profiles(
  id uuid primary key,
  user_id uuid,
  shop_id uuid,
  role text,
  demo_access_expires_at timestamptz
);

create table if not exists public.shop_members(
  shop_id uuid not null,
  user_id uuid not null,
  role text,
  created_by uuid,
  primary key (shop_id, user_id)
);
`;

const fixtureSqlAfterMigration = `
grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.shop_role(uuid) to authenticated;
grant select on public.shop_members, public.profiles to authenticated;
`;

describeDb("is_shop_member()/shop_role() — runtime database contract", () => {
  beforeEach(() => {
    psql(fixtureSqlBeforeMigration);

    const result = spawnSync(
      "psql",
      [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", migrationPath],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 },
    );
    if (result.status !== 0) {
      throw new Error(`Applying migration failed\n${result.stdout}\n${result.stderr}`);
    }

    psql(fixtureSqlAfterMigration);

    psql(`
      delete from public.shop_members where shop_id = '${SHOP_ID}';
      delete from public.profiles where id in (
        '${LEGACY_PROFILE_ID}', '${NORMAL_PROFILE_ID}', '${EXPIRED_PROFILE_ID}'
      );
      insert into public.profiles (id, user_id, shop_id, role, demo_access_expires_at) values
        ('${LEGACY_PROFILE_ID}', '${LEGACY_AUTH_UID}', '${SHOP_ID}', 'manager', null),
        ('${NORMAL_PROFILE_ID}', '${NORMAL_PROFILE_ID}', '${SHOP_ID}', 'owner', null),
        ('${EXPIRED_PROFILE_ID}', '${EXPIRED_PROFILE_ID}', '${SHOP_ID}', 'owner', now() - interval '1 hour');
      insert into public.shop_members (shop_id, user_id, role) values
        ('${SHOP_ID}', '${LEGACY_PROFILE_ID}', 'manager'),
        ('${SHOP_ID}', '${NORMAL_PROFILE_ID}', 'owner'),
        ('${SHOP_ID}', '${EXPIRED_PROFILE_ID}', 'owner');
    `);
  });

  function isShopMemberAs(uid: string): boolean {
    const output = psql(`
      select set_config('test.current_uid', '${uid}', false);
      set role authenticated;
      select is_shop_member('${SHOP_ID}');
    `);
    return lastLine(output) === "t";
  }

  function shopRoleAs(uid: string): string {
    const output = psql(`
      select set_config('test.current_uid', '${uid}', false);
      set role authenticated;
      select coalesce(shop_role('${SHOP_ID}'), '');
    `);
    return lastLine(output);
  }

  it("recognizes a legacy/imported profile (id <> user_id, auth.uid() = user_id) as a shop member", () => {
    expect(isShopMemberAs(LEGACY_AUTH_UID)).toBe(true);
  });

  it("resolves the correct role for a legacy/imported profile", () => {
    expect(shopRoleAs(LEGACY_AUTH_UID)).toBe("manager");
  });

  it("still recognizes a normal profile (id = user_id = auth.uid()) as a shop member", () => {
    expect(isShopMemberAs(NORMAL_PROFILE_ID)).toBe(true);
  });

  it("still denies a caller with no matching profile at all", () => {
    expect(isShopMemberAs(UNRELATED_UID)).toBe(false);
  });

  it("still denies an expired demo profile despite the identity fix", () => {
    expect(isShopMemberAs(EXPIRED_PROFILE_ID)).toBe(false);
    expect(shopRoleAs(EXPIRED_PROFILE_ID)).toBe("");
  });
});
