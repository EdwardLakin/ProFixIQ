import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Ops marketing funnel", () => {
  it("keeps the reader behind the existing Ops authorization boundary", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain("await requireOpsOperatorPageAccess()");
    expect(reader).toContain("const admin = createAdminSupabase()");
    expect(reader).toContain('.from("marketing_events")');
  });

  it("grants only the required marketing columns to the server service role", () => {
    const migration = source(
      "supabase/migrations/20261007183500_grant_marketing_events_ops_read.sql",
    );

    expect(migration).toContain(
      "revoke select on table public.marketing_events from service_role",
    );
    expect(migration).toContain("grant select (");
    for (const column of [
      "id",
      "created_at",
      "event_name",
      "source_path",
      "package_key",
      "checkout_mode",
      "checkout_attempt_id",
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).not.toContain("anonymous_session_id");
    expect(migration).not.toContain("destination");
    expect(migration).not.toContain("interval");
    expect(migration).not.toContain("grant select on table public.marketing_events to anon");
    expect(migration).not.toContain(
      "grant select on table public.marketing_events to authenticated",
    );
  });

  it("uses the checkout attempt key only for server-side source attribution", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");
    const component = source("features/ops/components/OpsMarketingFunnel.tsx");

    expect(reader).toContain(
      '"id,event_name,source_path,package_key,checkout_mode,checkout_attempt_id,created_at"',
    );
    expect(reader).toContain("sourceByAttempt.set(row.checkout_attempt_id, sourcePath)");
    expect(reader).not.toContain("anonymous_session_id");
    expect(component).not.toContain("checkout_attempt_id");
    expect(component).not.toContain("anonymous_session_id");
  });

  it("counts checkout intent only when a canonical checkout attempt exists", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain('query.not("checkout_attempt_id", "is", null)');
    expect(reader).toContain('eventName: "marketing_trial_click"');
    expect(reader).toContain('eventName: "marketing_subscribe_click"');
    expect(reader.match(/requireCheckoutAttempt: true/g)).toHaveLength(2);
    expect(reader).toContain("const checkoutIntent = isCheckoutIntent(row)");
  });

  it("uses a fixed upper boundary for a stable bounded 30-day snapshot", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain("const LOOKBACK_DAYS = 30");
    expect(reader).toContain("const MAX_BREAKDOWN_ROWS = 20000");
    expect(reader).toContain("const generatedAt = new Date().toISOString()");
    expect(reader).toContain('.lte("created_at", through)');
    expect(reader).toContain('order("created_at", { ascending: false })');
    expect(reader).toContain('order("id", { ascending: false })');
    expect(reader).toContain("readBreakdownRows(admin, since, generatedAt)");
    expect(reader).toContain("breakdownTruncated: totalEvents > rows.length");
  });

  it("filters source dimensions to canonical acquisition paths", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain("isAcquisitionMarketingPath(value)");
    expect(reader).toContain("canonicalSourcePath(row.source_path)");
  });

  it("retains authoritative checkout starts in an unattributed source bucket", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain('const UNATTRIBUTED_SOURCE = "Unattributed checkout"');
    expect(reader).toContain("sourceByAttempt.get(row.checkout_attempt_id) ?? UNATTRIBUTED_SOURCE");
    expect(reader).toContain(": UNATTRIBUTED_SOURCE");
  });

  it("surfaces source, package, checkout-intent, checkout-start, and progression views", () => {
    const component = source("features/ops/components/OpsMarketingFunnel.tsx");

    expect(component).toContain("By source page");
    expect(component).toContain("By product package");
    expect(component).toContain("Trial checkout intent");
    expect(component).toContain("Paid checkout intent");
    expect(component).toContain("Checkout starts");
    expect(component).toContain("Progression");
    expect(component).toContain("event volume");
    expect(component).toContain("not unique visitors");
  });

  it("adds the funnel to Ops navigation and keeps the page dynamic", () => {
    const shell = source("features/ops/components/OpsShell.tsx");
    const page = source("app/ops/marketing-funnel/page.tsx");

    expect(shell).toContain('href: "/ops/marketing-funnel"');
    expect(shell).toContain('label: "Acquisition Funnel"');
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getOpsMarketingFunnel()");
  });
});
