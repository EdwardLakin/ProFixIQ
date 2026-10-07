import "server-only";

import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const LOOKBACK_DAYS = 30;
const PAGE_SIZE = 1000;
const MAX_BREAKDOWN_ROWS = 20000;

const EVENT_NAMES = [
  "pricing_view",
  "marketing_trial_click",
  "marketing_subscribe_click",
  "marketing_demo_click",
  "checkout_started",
] as const;

type FunnelEventName = (typeof EVENT_NAMES)[number];

type MarketingEventRow = {
  event_name: string;
  source_path: string | null;
  package_key: string | null;
  checkout_mode: string | null;
  created_at: string;
};

export type OpsMarketingSourceRow = {
  sourcePath: string;
  pricingViews: number;
  trialClicks: number;
  subscribeClicks: number;
  demoClicks: number;
};

export type OpsMarketingPackageRow = {
  packageKey: string;
  trialClicks: number;
  subscribeClicks: number;
  checkoutStarted: number;
  trialCheckouts: number;
  paidCheckouts: number;
};

export type OpsMarketingFunnelSnapshot = {
  generatedAt: string;
  since: string;
  breakdownTruncated: boolean;
  summary: {
    totalEvents: number;
    pricingViews: number;
    trialClicks: number;
    subscribeClicks: number;
    demoClicks: number;
    checkoutStarted: number;
    trialCheckouts: number;
    paidCheckouts: number;
    checkoutIntentClicks: number;
    intentToCheckoutStartPct: number;
  };
  sources: OpsMarketingSourceRow[];
  packages: OpsMarketingPackageRow[];
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

async function countRows(
  eventName?: FunnelEventName,
  checkoutMode?: "trial" | "paid",
): Promise<number> {
  const admin = createAdminSupabase();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  let query = admin
    .from("marketing_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  if (eventName) query = query.eq("event_name", eventName);
  if (checkoutMode) query = query.eq("checkout_mode", checkoutMode);

  const { count, error } = await query;
  if (error) throw new Error(`Unable to count marketing events: ${error.message}`);
  return count ?? 0;
}

async function readBreakdownRows(since: string): Promise<MarketingEventRow[]> {
  const admin = createAdminSupabase();
  const rows: MarketingEventRow[] = [];

  for (let offset = 0; offset < MAX_BREAKDOWN_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("marketing_events")
      .select("event_name,source_path,package_key,checkout_mode,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Unable to load marketing funnel: ${error.message}`);
    const page = (data ?? []) as MarketingEventRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function buildSourceRows(rows: MarketingEventRow[]): OpsMarketingSourceRow[] {
  const grouped = new Map<string, OpsMarketingSourceRow>();

  for (const row of rows) {
    if (!row.source_path) continue;
    const current = grouped.get(row.source_path) ?? {
      sourcePath: row.source_path,
      pricingViews: 0,
      trialClicks: 0,
      subscribeClicks: 0,
      demoClicks: 0,
    };

    if (row.event_name === "pricing_view") current.pricingViews += 1;
    if (row.event_name === "marketing_trial_click") current.trialClicks += 1;
    if (row.event_name === "marketing_subscribe_click") current.subscribeClicks += 1;
    if (row.event_name === "marketing_demo_click") current.demoClicks += 1;
    grouped.set(row.source_path, current);
  }

  return [...grouped.values()].sort((a, b) => {
    const aTotal = a.pricingViews + a.trialClicks + a.subscribeClicks + a.demoClicks;
    const bTotal = b.pricingViews + b.trialClicks + b.subscribeClicks + b.demoClicks;
    return bTotal - aTotal || a.sourcePath.localeCompare(b.sourcePath);
  });
}

function buildPackageRows(rows: MarketingEventRow[]): OpsMarketingPackageRow[] {
  const grouped = new Map<string, OpsMarketingPackageRow>();

  for (const row of rows) {
    if (!row.package_key) continue;
    const current = grouped.get(row.package_key) ?? {
      packageKey: row.package_key,
      trialClicks: 0,
      subscribeClicks: 0,
      checkoutStarted: 0,
      trialCheckouts: 0,
      paidCheckouts: 0,
    };

    if (row.event_name === "marketing_trial_click") current.trialClicks += 1;
    if (row.event_name === "marketing_subscribe_click") current.subscribeClicks += 1;
    if (row.event_name === "checkout_started") {
      current.checkoutStarted += 1;
      if (row.checkout_mode === "trial") current.trialCheckouts += 1;
      if (row.checkout_mode === "paid") current.paidCheckouts += 1;
    }
    grouped.set(row.package_key, current);
  }

  return [...grouped.values()].sort(
    (a, b) => b.checkoutStarted - a.checkoutStarted || a.packageKey.localeCompare(b.packageKey),
  );
}

export async function getOpsMarketingFunnel(): Promise<OpsMarketingFunnelSnapshot> {
  await requireOpsOperatorPageAccess();

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const [
    totalEvents,
    pricingViews,
    trialClicks,
    subscribeClicks,
    demoClicks,
    checkoutStarted,
    trialCheckouts,
    paidCheckouts,
    rows,
  ] = await Promise.all([
    countRows(),
    countRows("pricing_view"),
    countRows("marketing_trial_click"),
    countRows("marketing_subscribe_click"),
    countRows("marketing_demo_click"),
    countRows("checkout_started"),
    countRows("checkout_started", "trial"),
    countRows("checkout_started", "paid"),
    readBreakdownRows(since),
  ]);

  const checkoutIntentClicks = trialClicks + subscribeClicks;

  return {
    generatedAt: new Date().toISOString(),
    since,
    breakdownTruncated: totalEvents > rows.length,
    summary: {
      totalEvents,
      pricingViews,
      trialClicks,
      subscribeClicks,
      demoClicks,
      checkoutStarted,
      trialCheckouts,
      paidCheckouts,
      checkoutIntentClicks,
      intentToCheckoutStartPct: pct(checkoutStarted, checkoutIntentClicks),
    },
    sources: buildSourceRows(rows),
    packages: buildPackageRows(rows),
  };
}
