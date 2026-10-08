import "server-only";

import { isAcquisitionMarketingPath } from "@/features/analytics/marketingEvents";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const LOOKBACK_DAYS = 30;
const MAX_BREAKDOWN_ROWS = 20000;
const UNATTRIBUTED_SOURCE = "Unattributed";
const UNATTRIBUTED_PACKAGE = "Legacy / unattributed";

type MarketingEventRow = {
  event_name: string;
  source_path: string | null;
  package_key: string | null;
  checkout_mode: string | null;
  checkout_attempt_id: string | null;
  created_at: string;
};

type FunnelRpcSummary = {
  totalEvents: number;
  pricingViews: number;
  trialClicks: number;
  subscribeClicks: number;
  demoClicks: number;
  checkoutStarted: number;
  trialCheckouts: number;
  paidCheckouts: number;
};

type FunnelLifecycleRpcSummary = {
  signupCompleted: number;
  onboardingCompleted: number;
};

type FunnelRpcSnapshot = {
  generatedAt: string;
  since: string;
  breakdownTruncated: boolean;
  summary: FunnelRpcSummary;
  lifecycleSummary: FunnelLifecycleRpcSummary;
  rows: MarketingEventRow[];
};

export type OpsMarketingSourceRow = {
  sourcePath: string;
  pricingViews: number;
  trialClicks: number;
  subscribeClicks: number;
  demoClicks: number;
  checkoutStarted: number;
  signupCompleted: number;
  onboardingCompleted: number;
  intentToCheckoutStartPct: number;
  checkoutToSignupPct: number;
  signupToOnboardingPct: number;
};

export type OpsMarketingPackageRow = {
  packageKey: string;
  trialClicks: number;
  subscribeClicks: number;
  checkoutStarted: number;
  trialCheckouts: number;
  paidCheckouts: number;
  signupCompleted: number;
  onboardingCompleted: number;
  intentToCheckoutStartPct: number;
  checkoutToSignupPct: number;
  signupToOnboardingPct: number;
};

export type OpsMarketingFunnelSnapshot = {
  generatedAt: string;
  since: string;
  breakdownTruncated: boolean;
  summary: FunnelRpcSummary &
    FunnelLifecycleRpcSummary & {
      checkoutIntentClicks: number;
      intentToCheckoutStartPct: number;
      checkoutToSignupPct: number;
      signupToOnboardingPct: number;
    };
  sources: OpsMarketingSourceRow[];
  packages: OpsMarketingPackageRow[];
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function canonicalSourcePath(value: string | null): string | null {
  return value && isAcquisitionMarketingPath(value) ? value : null;
}

function isCheckoutIntent(row: MarketingEventRow): boolean {
  return Boolean(
    row.checkout_attempt_id &&
      (row.event_name === "marketing_trial_click" ||
        row.event_name === "marketing_subscribe_click"),
  );
}

function isAttemptAttributedLifecycleEvent(row: MarketingEventRow): boolean {
  return (
    row.event_name === "checkout_started" ||
    row.event_name === "signup_completed" ||
    row.event_name === "onboarding_completed"
  );
}

function buildSourceRows(rows: MarketingEventRow[]): OpsMarketingSourceRow[] {
  const sourceByAttempt = new Map<string, string>();
  const grouped = new Map<string, OpsMarketingSourceRow>();

  for (const row of rows) {
    const sourcePath = canonicalSourcePath(row.source_path);
    if (isCheckoutIntent(row) && row.checkout_attempt_id && sourcePath) {
      sourceByAttempt.set(row.checkout_attempt_id, sourcePath);
    }
  }

  for (const row of rows) {
    const checkoutIntent = isCheckoutIntent(row);
    if (
      (row.event_name === "marketing_trial_click" ||
        row.event_name === "marketing_subscribe_click") &&
      !checkoutIntent
    ) {
      continue;
    }

    const sourcePath = isAttemptAttributedLifecycleEvent(row)
      ? row.checkout_attempt_id
        ? sourceByAttempt.get(row.checkout_attempt_id) ?? UNATTRIBUTED_SOURCE
        : UNATTRIBUTED_SOURCE
      : checkoutIntent
        ? canonicalSourcePath(row.source_path) ?? UNATTRIBUTED_SOURCE
        : canonicalSourcePath(row.source_path);
    if (!sourcePath) continue;

    const current = grouped.get(sourcePath) ?? {
      sourcePath,
      pricingViews: 0,
      trialClicks: 0,
      subscribeClicks: 0,
      demoClicks: 0,
      checkoutStarted: 0,
      signupCompleted: 0,
      onboardingCompleted: 0,
      intentToCheckoutStartPct: 0,
      checkoutToSignupPct: 0,
      signupToOnboardingPct: 0,
    };

    if (row.event_name === "pricing_view") current.pricingViews += 1;
    if (row.event_name === "marketing_trial_click") current.trialClicks += 1;
    if (row.event_name === "marketing_subscribe_click") current.subscribeClicks += 1;
    if (row.event_name === "marketing_demo_click") current.demoClicks += 1;
    if (row.event_name === "checkout_started") current.checkoutStarted += 1;
    if (row.event_name === "signup_completed") current.signupCompleted += 1;
    if (row.event_name === "onboarding_completed") {
      current.onboardingCompleted += 1;
    }
    grouped.set(sourcePath, current);
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      intentToCheckoutStartPct: pct(
        row.checkoutStarted,
        row.trialClicks + row.subscribeClicks,
      ),
      checkoutToSignupPct: pct(row.signupCompleted, row.checkoutStarted),
      signupToOnboardingPct: pct(
        row.onboardingCompleted,
        row.signupCompleted,
      ),
    }))
    .sort((a, b) => {
      const aTotal = a.trialClicks + a.subscribeClicks;
      const bTotal = b.trialClicks + b.subscribeClicks;
      return (
        b.checkoutStarted - a.checkoutStarted ||
        bTotal - aTotal ||
        a.sourcePath.localeCompare(b.sourcePath)
      );
    });
}

function packageKeyForRow(row: MarketingEventRow): string | null {
  if (row.package_key) return row.package_key;
  if (isAttemptAttributedLifecycleEvent(row) || isCheckoutIntent(row)) {
    return UNATTRIBUTED_PACKAGE;
  }
  return null;
}

function buildPackageRows(rows: MarketingEventRow[]): OpsMarketingPackageRow[] {
  const grouped = new Map<string, OpsMarketingPackageRow>();

  for (const row of rows) {
    if (
      (row.event_name === "marketing_trial_click" ||
        row.event_name === "marketing_subscribe_click") &&
      !isCheckoutIntent(row)
    ) {
      continue;
    }

    const packageKey = packageKeyForRow(row);
    if (!packageKey) continue;

    const current = grouped.get(packageKey) ?? {
      packageKey,
      trialClicks: 0,
      subscribeClicks: 0,
      checkoutStarted: 0,
      trialCheckouts: 0,
      paidCheckouts: 0,
      signupCompleted: 0,
      onboardingCompleted: 0,
      intentToCheckoutStartPct: 0,
      checkoutToSignupPct: 0,
      signupToOnboardingPct: 0,
    };

    if (row.event_name === "marketing_trial_click") current.trialClicks += 1;
    if (row.event_name === "marketing_subscribe_click") {
      current.subscribeClicks += 1;
    }
    if (row.event_name === "checkout_started") {
      current.checkoutStarted += 1;
      if (row.checkout_mode === "trial") current.trialCheckouts += 1;
      if (row.checkout_mode === "paid") current.paidCheckouts += 1;
    }
    if (row.event_name === "signup_completed") current.signupCompleted += 1;
    if (row.event_name === "onboarding_completed") {
      current.onboardingCompleted += 1;
    }
    grouped.set(packageKey, current);
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      intentToCheckoutStartPct: pct(
        row.checkoutStarted,
        row.trialClicks + row.subscribeClicks,
      ),
      checkoutToSignupPct: pct(row.signupCompleted, row.checkoutStarted),
      signupToOnboardingPct: pct(
        row.onboardingCompleted,
        row.signupCompleted,
      ),
    }))
    .sort(
      (a, b) =>
        b.checkoutStarted - a.checkoutStarted ||
        a.packageKey.localeCompare(b.packageKey),
    );
}

function parseRpcSnapshot(data: unknown): FunnelRpcSnapshot {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Unable to load marketing funnel: invalid snapshot payload");
  }

  const snapshot = data as Partial<FunnelRpcSnapshot>;
  if (
    typeof snapshot.generatedAt !== "string" ||
    typeof snapshot.since !== "string" ||
    typeof snapshot.breakdownTruncated !== "boolean" ||
    !snapshot.summary ||
    !snapshot.lifecycleSummary ||
    !Array.isArray(snapshot.rows)
  ) {
    throw new Error("Unable to load marketing funnel: invalid snapshot payload");
  }

  return snapshot as FunnelRpcSnapshot;
}

export async function getOpsMarketingFunnel(): Promise<OpsMarketingFunnelSnapshot> {
  await requireOpsOperatorPageAccess();

  const admin = createAdminSupabase();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const { data, error } = await admin.rpc(
    "get_ops_marketing_lifecycle_funnel_snapshot",
    {
      p_since: since,
      p_breakdown_limit: MAX_BREAKDOWN_ROWS,
    },
  );

  if (error) throw new Error(`Unable to load marketing funnel: ${error.message}`);

  const snapshot = parseRpcSnapshot(data);
  const checkoutIntentClicks =
    snapshot.summary.trialClicks + snapshot.summary.subscribeClicks;

  return {
    generatedAt: snapshot.generatedAt,
    since: snapshot.since,
    breakdownTruncated: snapshot.breakdownTruncated,
    summary: {
      ...snapshot.summary,
      ...snapshot.lifecycleSummary,
      checkoutIntentClicks,
      intentToCheckoutStartPct: pct(
        snapshot.summary.checkoutStarted,
        checkoutIntentClicks,
      ),
      checkoutToSignupPct: pct(
        snapshot.lifecycleSummary.signupCompleted,
        snapshot.summary.checkoutStarted,
      ),
      signupToOnboardingPct: pct(
        snapshot.lifecycleSummary.onboardingCompleted,
        snapshot.lifecycleSummary.signupCompleted,
      ),
    },
    sources: buildSourceRows(snapshot.rows),
    packages: buildPackageRows(snapshot.rows),
  };
}
