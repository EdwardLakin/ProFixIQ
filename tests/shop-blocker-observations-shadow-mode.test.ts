import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function findFilesContaining(root: string, needle: string): string[] {
  const matches: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        stack.push(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (readFileSync(full, "utf8").includes(needle)) {
        matches.push(full.replaceAll("\\", "/"));
      }
    }
  }

  return matches;
}

const migrationFile = readdirSync("supabase/migrations").find((name) =>
  name.endsWith("_shop_blocker_observations_shadow_mode.sql"),
);
if (!migrationFile) {
  throw new Error("shop_blocker_observations migration not found");
}
const migration = readFileSync(
  `supabase/migrations/${migrationFile}`,
  "utf8",
);
const syncModule = readFileSync(
  "features/operations/server/syncShopBlockerObservations.ts",
  "utf8",
);
const route = readFileSync(
  "app/api/internal/observability/shop-blockers/route.ts",
  "utf8",
);
const getOpsNotifications = readFileSync(
  "features/agent/server/getOpsNotifications.ts",
  "utf8",
);
const vercelConfig = readFileSync("vercel.json", "utf8");

describe("Phase 3 — shadow-mode shop blocker observer", () => {
  it("is a dedicated table, not a reuse of the user-facing notifications table", () => {
    expect(migration).toContain(
      "create table if not exists public.shop_blocker_observations",
    );
    expect(migration).not.toContain("assistant_notifications");
  });

  it("is fully inaccessible to application roles (true shadow mode)", () => {
    expect(migration).toContain(
      "alter table public.shop_blocker_observations enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table public.shop_blocker_observations from anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on table public.shop_blocker_observations to service_role",
    );
    expect(migration).not.toMatch(/create policy/);
  });

  it("records why a finding fired and leaves room for a false-positive review", () => {
    expect(migration).toContain("reason jsonb not null default '{}'");
    expect(migration).toContain("is_false_positive boolean");
    expect(migration).toContain("reviewed_at timestamptz");
    expect(migration).toContain(
      "shop_blocker_observations_review_requires_timestamp_chk",
    );
  });

  it("deduplicates findings per shop by fingerprint", () => {
    expect(migration).toContain(
      "constraint shop_blocker_observations_shop_fingerprint_key",
    );
    expect(migration).toContain("unique (shop_id, fingerprint)");
  });

  it("reuses the existing detection rules instead of inventing a parallel rule engine", () => {
    expect(syncModule).toContain("getOpsNotifications(");
    expect(syncModule).toContain("buildBlockerFingerprint(");
  });

  it("identifies a blocker by stable domain keys, not its mutable presentation href", () => {
    expect(syncModule).not.toMatch(/buildBlockerFingerprint[\s\S]{0,200}href/);
  });

  it("requires a full extra cron cycle of absence before resolving a finding", () => {
    expect(syncModule).toContain("RESOLUTION_GRACE_MS");
    expect(syncModule).toContain(
      "now.getTime() - new Date(row.last_seen_at).getTime() >=",
    );
  });

  it("conditions each resolve on the last-read last_seen_at so a stale run cannot clobber a fresher one", () => {
    expect(syncModule).toContain('.eq("last_seen_at", row.last_seen_at)');
  });

  it("excludes the one rule whose false-positive rate depends on being queried only during business hours", () => {
    expect(syncModule).toContain("EXCLUDED_SCHEDULED_CODES");
    expect(syncModule).toContain("tech_underutilized_capacity");
  });

  it("records the rule inputs behind each finding, not just its presentation message", () => {
    expect(getOpsNotifications).toContain("evidence?:");
    expect(getOpsNotifications).toContain("evidence: {");
    expect(syncModule).toContain("notification.evidence");
  });

  it("runs shop-wide detection with an injected admin client, not a request-scoped one", () => {
    expect(getOpsNotifications).toContain("supabaseClient?:");
    expect(getOpsNotifications).toContain(
      "const supabase = supabaseClient ?? getServerSupabase();",
    );
  });

  it("never writes to a work-order, approval, parts, or any other workflow table", () => {
    expect(syncModule).not.toMatch(
      /\.from\(\s*["'](work_orders|work_order_lines|part_requests|invoices|bookings)["']/,
    );
  });

  it("is authenticated as an internal cron route, not a user-facing one", () => {
    expect(route).toContain("requireInternalApiSecret");
    expect(route).toContain("INTERNAL_CRON_SECRET");
    expect(route).toContain("CRON_SECRET");
  });

  it("is scheduled hourly, offset from the existing observability health cron", () => {
    expect(vercelConfig).toContain(
      '"path": "/api/internal/observability/shop-blockers"',
    );
    expect(vercelConfig).toMatch(
      /"path":\s*"\/api\/internal\/observability\/shop-blockers",\s*\n\s*"schedule":\s*"37 \* \* \* \*"/,
    );
  });

  it("pages through every shop instead of applying a fixed, non-progressing cap", () => {
    expect(route).toContain("fetchAllShopIds");
    expect(route).toContain('.gt("created_at", cursor)');
  });

  it("is not read by any existing assistant or dashboard surface", () => {
    const matches = [
      ...findFilesContaining("app", "shop_blocker_observations"),
      ...findFilesContaining("features", "shop_blocker_observations"),
    ].sort();

    expect(matches).toEqual(
      [
        "features/operations/server/syncShopBlockerObservations.ts",
        "features/shared/types/types/supabase.ts",
      ].sort(),
    );
  });
});
