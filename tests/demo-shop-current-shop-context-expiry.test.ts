import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Follow-up to PR 1 (demo-shop/pr1-access-foundation): audit after that PR
// landed found that most tenant-scoped tables are gated by RLS policies of
// the shape "shop_id = current_shop_id()", not by is_shop_member()/
// shop_role()/is_staff_for_shop() (the helpers PR 1 made expiry-aware).
// current_shop_id() and set_current_shop_id(uuid) are independent
// authorization gates (see the migration's own header comment) and both
// needed the same expiry condition. This file covers that fix, plus the two
// landing routes (/dashboard/operations, /mobile) that previously bypassed
// the centralized page-access gate entirely.

const migrationFileName = "20260923000000_demo_shop_current_shop_context_expiry.sql";
const migration = readFileSync(
  `supabase/migrations/${migrationFileName}`,
  "utf8",
);

function extractFunctionBody(sql: string, functionSignature: string): string {
  const start = sql.indexOf(functionSignature);
  if (start === -1) {
    throw new Error(`Function signature not found: ${functionSignature}`);
  }
  const nextFunctionIndex = sql.indexOf(
    "CREATE OR REPLACE FUNCTION",
    start + functionSignature.length,
  );
  return nextFunctionIndex === -1
    ? sql.slice(start)
    : sql.slice(start, nextFunctionIndex);
}

const currentShopIdBody = extractFunctionBody(
  migration,
  "CREATE OR REPLACE FUNCTION public.current_shop_id()",
);
const setCurrentShopIdBody = extractFunctionBody(
  migration,
  "CREATE OR REPLACE FUNCTION public.set_current_shop_id(p_shop_id uuid)",
);

describe("current_shop_id() — SQL contract", () => {
  it("keeps its existing profiles.id/profiles.user_id identity resolution and adds only the expiry condition", () => {
    expect(currentShopIdBody).toContain("p.id = (select auth.uid())");
    expect(currentShopIdBody).toContain("p.user_id = (select auth.uid())");
    expect(currentShopIdBody).toContain(
      "and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())",
    );
  });

  it("preserves its identity-preference ordering (canonical id before linked user_id)", () => {
    expect(currentShopIdBody).toContain(
      "case when p.id = (select auth.uid()) then 0 else 1 end",
    );
  });

  it("preserves its signature, security, and search_path characteristics", () => {
    expect(currentShopIdBody).toContain("RETURNS uuid");
    expect(currentShopIdBody).toContain("LANGUAGE sql");
    expect(currentShopIdBody).toContain("STABLE");
    expect(currentShopIdBody).toContain("SECURITY DEFINER");
    expect(currentShopIdBody).toContain("SET search_path TO 'public', 'pg_temp'");
  });
});

describe("set_current_shop_id(uuid) — SQL contract", () => {
  it("keeps its existing shop/profile membership check and adds only the expiry condition", () => {
    expect(setCurrentShopIdBody).toContain("p.shop_id = p_shop_id");
    expect(setCurrentShopIdBody).toContain("p.id = (select auth.uid())");
    expect(setCurrentShopIdBody).toContain("p.user_id = (select auth.uid())");
    expect(setCurrentShopIdBody).toContain(
      "and (p.demo_access_expires_at is null or p.demo_access_expires_at > now())",
    );
  });

  it("preserves the exception it raises for a real shop mismatch", () => {
    expect(setCurrentShopIdBody).toContain(
      "raise exception 'Not allowed to set current shop to %', p_shop_id",
    );
    expect(setCurrentShopIdBody).toContain("errcode = '42501'");
  });

  it("preserves its GUC-setting behavior for existing callers", () => {
    expect(setCurrentShopIdBody).toContain(
      "perform set_config('app.current_shop_id', p_shop_id::text, true);",
    );
  });

  it("preserves its signature, security, and search_path characteristics", () => {
    expect(setCurrentShopIdBody).toContain("RETURNS void");
    expect(setCurrentShopIdBody).toContain("LANGUAGE plpgsql");
    expect(setCurrentShopIdBody).toContain("SECURITY DEFINER");
    expect(setCurrentShopIdBody).toContain("SET search_path TO 'public', 'pg_temp'");
  });
});

// Runtime/database coverage: exercises the actual migration SQL (read from
// disk, not re-typed) against real Postgres, including RLS enforcement on a
// representative core table gated the same way as work_orders/invoices/
// payments/history/inspections in production: "shop_id = current_shop_id()".
// Opt-in, matching this repo's existing tests/parts/parts-lifecycle-db.
// integration.test.ts convention: runs when a scratch Postgres is available
// via DEMO_SHOP_EXPIRY_TEST_DATABASE_URL, skipped otherwise (including CI,
// which does not provision one, same as that existing test).
const databaseUrl = process.env.DEMO_SHOP_EXPIRY_TEST_DATABASE_URL;
const hasPsql =
  spawnSync("bash", ["-lc", "command -v psql"], { encoding: "utf8" }).status === 0;
const describeDb = databaseUrl && hasPsql ? describe : describe.skip;

function psql(sql: string): string {
  const result = spawnSync(
    "psql",
    [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 },
  );
  if (result.status !== 0) {
    throw new Error(`psql failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

// Used only where an error is the expected, correct outcome (an expired
// profile calling set_current_shop_id()) — ON_ERROR_STOP would otherwise
// turn that into a thrown exception instead of an assertable result.
function psqlAllowError(sql: string): { stdout: string; stderr: string } {
  const result = spawnSync("psql", [databaseUrl!, "-X", "-q", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

const SHOP_ID = "99999999-9999-9999-9999-999999999999";
const NORMAL_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const FUTURE_EXPIRY_PROFILE_ID = "22222222-2222-2222-2222-222222222222";
const EXPIRED_PROFILE_ID = "33333333-3333-3333-3333-333333333333";
const WORK_ORDER_ID = "44444444-4444-4444-4444-444444444444";

const fixtureSql = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.current_uid', true), '')::uuid
$$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;

create table if not exists public.profiles(
  id uuid primary key,
  user_id uuid,
  shop_id uuid,
  demo_access_expires_at timestamptz
);

create table if not exists public.work_orders(
  id uuid primary key,
  shop_id uuid not null
);

alter table public.work_orders enable row level security;
alter table public.work_orders force row level security;
drop policy if exists wo_test_select on public.work_orders;
create policy wo_test_select on public.work_orders for select to authenticated
  using (shop_id = current_shop_id());

grant select on public.work_orders to authenticated;
grant select on public.profiles to authenticated;
grant execute on function public.current_shop_id() to authenticated;
grant execute on function public.set_current_shop_id(uuid) to authenticated;
`;

describeDb("current_shop_id()/set_current_shop_id() — runtime database contract", () => {
  beforeEach(() => {
    psql(fixtureSql);
    // Apply the real migration file itself (not a re-typed copy).
    const result = spawnSync(
      "psql",
      [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", `supabase/migrations/${migrationFileName}`],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 },
    );
    if (result.status !== 0) {
      throw new Error(`Applying migration failed\n${result.stdout}\n${result.stderr}`);
    }

    psql(`
      delete from public.work_orders where shop_id = '${SHOP_ID}';
      delete from public.profiles where id in (
        '${NORMAL_PROFILE_ID}', '${FUTURE_EXPIRY_PROFILE_ID}', '${EXPIRED_PROFILE_ID}'
      );
      insert into public.profiles (id, shop_id, demo_access_expires_at) values
        ('${NORMAL_PROFILE_ID}', '${SHOP_ID}', null),
        ('${FUTURE_EXPIRY_PROFILE_ID}', '${SHOP_ID}', now() + interval '1 hour'),
        ('${EXPIRED_PROFILE_ID}', '${SHOP_ID}', now() - interval '1 hour');
      insert into public.work_orders (id, shop_id) values ('${WORK_ORDER_ID}', '${SHOP_ID}');
    `);
  });

  // -t -A prints one line per statement (SET produces none), so a
  // multi-statement call returns every SELECT's result concatenated by
  // newline; only the final line is the one under test.
  function lastLine(output: string): string {
    const lines = output.split("\n").filter((line) => line.length > 0);
    return lines[lines.length - 1] ?? "";
  }

  function currentShopIdAs(profileId: string): string {
    return lastLine(
      psql(`
        select set_config('test.current_uid', '${profileId}', false);
        set role authenticated;
        select coalesce(current_shop_id()::text, 'NULL');
      `),
    );
  }

  function visibleWorkOrderCountAs(profileId: string): number {
    return Number(
      lastLine(
        psql(`
          select set_config('test.current_uid', '${profileId}', false);
          set role authenticated;
          select count(*) from public.work_orders;
        `),
      ),
    );
  }

  it("lets a normal (demo_access_expires_at IS NULL) profile establish current shop context", () => {
    expect(currentShopIdAs(NORMAL_PROFILE_ID)).toBe(SHOP_ID);
  });

  it("lets a future-expiry profile establish current shop context", () => {
    expect(currentShopIdAs(FUTURE_EXPIRY_PROFILE_ID)).toBe(SHOP_ID);
  });

  it("does not let an expired profile establish current shop context", () => {
    expect(currentShopIdAs(EXPIRED_PROFILE_ID)).toBe("NULL");
  });

  it("blocks an expired profile from a representative core table gated by shop_id = current_shop_id(), while normal and future-expiry profiles can see it", () => {
    expect(visibleWorkOrderCountAs(NORMAL_PROFILE_ID)).toBe(1);
    expect(visibleWorkOrderCountAs(FUTURE_EXPIRY_PROFILE_ID)).toBe(1);
    expect(visibleWorkOrderCountAs(EXPIRED_PROFILE_ID)).toBe(0);
  });

  it("lets a normal profile call set_current_shop_id() for its own shop", () => {
    const { stderr } = psqlAllowError(`
      select set_config('test.current_uid', '${NORMAL_PROFILE_ID}', false);
      set role authenticated;
      select set_current_shop_id('${SHOP_ID}');
    `);
    expect(stderr).not.toContain("Not allowed to set current shop");
  });

  it("rejects an expired profile calling set_current_shop_id() for its own shop", () => {
    const { stderr } = psqlAllowError(`
      select set_config('test.current_uid', '${EXPIRED_PROFILE_ID}', false);
      set role authenticated;
      select set_current_shop_id('${SHOP_ID}');
    `);
    expect(stderr).toContain("Not allowed to set current shop");
  });
});

// Landing-route coverage: /dashboard/operations and /mobile previously
// resolved the profile directly and rendered unconditionally, bypassing
// requireShopPageAccess() (and therefore its expiry check) entirely. Both
// now call the same centralized gate with no added page-specific logic;
// requireShopPageAccess()'s own expiry behavior is exhaustively covered in
// tests/demo-shop-access-expiry.test.ts, so these tests exercise the real
// gate end-to-end through each page rather than re-testing its internals.
const createServerSupabaseRSCMock = vi.hoisted(() => vi.fn());
const resolveCanonicalStaffProfileMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: vi.fn(),
  createServerSupabaseRSC: createServerSupabaseRSCMock,
  createServerSupabaseRoute: vi.fn(),
}));

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: resolveCanonicalStaffProfileMock,
}));

vi.mock("@/features/operations/components/OperationalHealthAlertStrip", () => ({
  default: () => null,
}));
vi.mock("../app/dashboard/_components/OperationsDashboardView", () => ({
  default: () => null,
}));
vi.mock("../app/dashboard/_components/OperationsDashboardFreshness", () => ({
  default: ({ children }: { children?: unknown }) => children ?? null,
}));
vi.mock("@/features/mobile/dashboard/MobileHome", () => ({
  default: () => null,
}));

const AUTH_USER_ID = "55555555-5555-4555-8555-555555555555";
const PROFILE_ID = "66666666-6666-4666-8666-666666666666";

function mockAuthedProfile(demoAccessExpiresAt: string | null) {
  createServerSupabaseRSCMock.mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: AUTH_USER_ID } },
        error: null,
      }),
    },
  });
  resolveCanonicalStaffProfileMock.mockResolvedValue({
    profile: {
      id: PROFILE_ID,
      user_id: AUTH_USER_ID,
      shop_id: SHOP_ID,
      role: "owner",
      demo_access_expires_at: demoAccessExpiresAt,
    },
    error: null,
  });
}

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("landing route expiry gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("/dashboard/operations", () => {
    it("renders for a normal (non-demo) profile", async () => {
      mockAuthedProfile(null);
      const { default: OperationsDashboardPage } = await import(
        "../app/dashboard/operations/page"
      );

      await expect(OperationsDashboardPage()).resolves.toBeTruthy();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("rejects an expired demo profile through the centralized gate", async () => {
      mockAuthedProfile(PAST);
      const { default: OperationsDashboardPage } = await import(
        "../app/dashboard/operations/page"
      );

      await expect(OperationsDashboardPage()).rejects.toThrow(
        "redirect:/auth/signout",
      );
    });
  });

  describe("/mobile", () => {
    it("renders for a normal (non-demo) profile", async () => {
      mockAuthedProfile(null);
      const { default: MobilePage } = await import("../app/mobile/page");

      await expect(MobilePage()).resolves.toBeTruthy();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it("rejects an expired demo profile through the centralized gate", async () => {
      mockAuthedProfile(PAST);
      const { default: MobilePage } = await import("../app/mobile/page");

      await expect(MobilePage()).rejects.toThrow("redirect:/auth/signout");
    });
  });
});
