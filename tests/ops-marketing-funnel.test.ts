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

  it("grants only the server service role the read privilege needed by Ops", () => {
    const migration = source(
      "supabase/migrations/20261007183500_grant_marketing_events_ops_read.sql",
    );

    expect(migration).toContain(
      "grant select on table public.marketing_events to service_role",
    );
    expect(migration).not.toContain("grant select on table public.marketing_events to anon");
    expect(migration).not.toContain(
      "grant select on table public.marketing_events to authenticated",
    );
  });

  it("reads only non-PII funnel dimensions for breakdowns", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain(
      '.select("event_name,source_path,package_key,checkout_mode,created_at")',
    );
    expect(reader).not.toContain("anonymous_session_id");
    expect(reader).not.toContain("checkout_attempt_id");
  });

  it("uses exact stage counts and a bounded 30-day breakdown window", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain("const LOOKBACK_DAYS = 30");
    expect(reader).toContain("const MAX_BREAKDOWN_ROWS = 20000");
    expect(reader).toContain('countRows(admin, since, "pricing_view")');
    expect(reader).toContain('countRows(admin, since, "marketing_trial_click")');
    expect(reader).toContain('countRows(admin, since, "marketing_subscribe_click")');
    expect(reader).toContain('countRows(admin, since, "marketing_demo_click")');
    expect(reader).toContain('countRows(admin, since, "checkout_started")');
    expect(reader).toContain('countRows(admin, since, "checkout_started", "trial")');
    expect(reader).toContain('countRows(admin, since, "checkout_started", "paid")');
    expect(reader).toContain("breakdownTruncated: totalEvents > rows.length");
  });

  it("surfaces source, package, trial, paid, and checkout-start funnel views", () => {
    const component = source("features/ops/components/OpsMarketingFunnel.tsx");

    expect(component).toContain("By source page");
    expect(component).toContain("By product package");
    expect(component).toContain("Trial intent");
    expect(component).toContain("Paid intent");
    expect(component).toContain("Checkout starts");
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
