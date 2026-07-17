"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GuidedOnboardingStepRow } from "@/features/onboarding-v2/guided/types";

type ResolutionAction = "linked_to_existing" | "created_new" | "ignored";
type RecommendedAction = "link_existing" | "create_new" | "merge_candidate" | "ignore";
type ReviewStatus = "pending" | "failed_materialization" | "materialized" | "ignored" | "resolved";

type ReviewItem = {
  id: string;
  intake_id: string;
  domain: string;
  issue_type: string;
  summary: string;
  status: ReviewStatus | string;
  blocking_reason: string | null;
  materialization_error: string | null;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
  review_explanation: string;
  recommendation_explanation: string;
  recommendation: {
    recommendedAction: RecommendedAction;
    recommendationReason: string;
    recommendationConfidence: number;
    confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
    candidateTargets: Array<{ id: string; label: string; score: number }>;
  };
};

type ReviewResponse = {
  ok: true;
  intakeId: string;
  items: ReviewItem[];
  summary: {
    unresolved_total: number;
    blockers_total: number;
    status_counts: Record<string, number>;
  };
  guidance: {
    state: string;
    operational_blockers_count: number;
    non_blocking_issues_count: number;
  };
};

type Props = {
  steps: GuidedOnboardingStepRow[];
};

const DOMAIN_FILTERS = [
  { key: "all", label: "All" },
  { key: "customers", label: "Customers" },
  { key: "vehicles", label: "Vehicles" },
  { key: "history", label: "History" },
  { key: "invoices", label: "Invoices" },
  { key: "parts", label: "Parts" },
] as const;

const IGNORE_REASONS = [
  { value: "duplicate", label: "Duplicate" },
  { value: "obsolete", label: "Old or obsolete data" },
  { value: "invalid", label: "Invalid row" },
  { value: "test_data", label: "Test data" },
  { value: "intentionally_skipped", label: "Intentionally skipped" },
  { value: "unsupported_format", label: "Unsupported format" },
  { value: "other", label: "Other" },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function canonicalDomain(domain: string) {
  const normalized = domain.trim().toLowerCase();
  if (normalized === "customer" || normalized === "customers") return "customers";
  if (normalized === "vehicle" || normalized === "vehicles") return "vehicles";
  if (normalized === "history" || normalized === "work_order" || normalized === "work_orders") return "history";
  if (normalized === "invoice" || normalized === "invoices") return "invoices";
  if (normalized === "part" || normalized === "parts") return "parts";
  return null;
}

function domainLabel(domain: string) {
  const canonical = canonicalDomain(domain);
  return DOMAIN_FILTERS.find((item) => item.key === canonical)?.label ?? domain;
}

function resolutionForRecommendation(action: RecommendedAction): ResolutionAction {
  if (action === "link_existing" || action === "merge_candidate") return "linked_to_existing";
  if (action === "ignore") return "ignored";
  return "created_new";
}

function recommendedActionLabel(action: RecommendedAction, failed: boolean) {
  const prefix = failed ? "Retry: " : "";
  if (action === "link_existing") return `${prefix}Link existing record`;
  if (action === "merge_candidate") return `${prefix}Confirm duplicate link`;
  if (action === "ignore") return `${prefix}Ignore invalid row`;
  return `${prefix}Create missing record`;
}

function isHighRisk(item: ReviewItem) {
  return (
    item.recommendation.recommendedAction === "merge_candidate" ||
    item.issue_type === "conflict" ||
    item.issue_type === "duplicate_candidate"
  );
}

function findInstantAnalysisIntake(steps: GuidedOnboardingStepRow[]) {
  for (const step of steps) {
    const answer = asRecord(step.answer);
    if (answer.source !== "instant_shop_analysis") continue;
    const intakeId = typeof answer.intakeId === "string" ? answer.intakeId.trim() : "";
    if (intakeId) return intakeId;
  }
  return null;
}

async function readJsonError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export default function InstantAnalysisReviewPanel({ steps }: Props) {
  const intakeId = useMemo(() => findInstantAnalysisIntake(steps), [steps]);
  const [payload, setPayload] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof DOMAIN_FILTERS)[number]["key"]>("all");
  const [confirmHighRiskId, setConfirmHighRiskId] = useState<string | null>(null);
  const [ignoreItemId, setIgnoreItemId] = useState<string | null>(null);
  const [ignoreReason, setIgnoreReason] = useState<(typeof IGNORE_REASONS)[number]["value"]>("intentionally_skipped");

  const loadReview = useCallback(async () => {
    if (!intakeId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ intakeId, status: "" });
      const response = await fetch(`/api/shop-boost/review-items?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readJsonError(response, "Unable to load data cleanup"));
      setPayload((await response.json()) as ReviewResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load data cleanup");
    } finally {
      setLoading(false);
    }
  }, [intakeId]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const unresolvedItems = useMemo(
    () =>
      (payload?.items ?? []).filter(
        (item) =>
          (item.status === "pending" || item.status === "failed_materialization") &&
          canonicalDomain(item.domain),
      ),
    [payload],
  );

  const visibleItems = useMemo(
    () =>
      filter === "all"
        ? unresolvedItems
        : unresolvedItems.filter((item) => canonicalDomain(item.domain) === filter),
    [filter, unresolvedItems],
  );

  const countsByDomain = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of unresolvedItems) {
      const domain = canonicalDomain(item.domain);
      if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    return counts;
  }, [unresolvedItems]);

  const resolveItem = useCallback(
    async (
      item: ReviewItem,
      resolutionAction: ResolutionAction,
      options?: { confirmHighRisk?: boolean; ignoreReason?: string },
    ) => {
      setBusyItemId(item.id);
      setError(null);
      try {
        const response = await fetch(`/api/shop-boost/review-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolution_action: resolutionAction,
            confirm_high_risk_action: options?.confirmHighRisk === true,
            ...(resolutionAction === "ignored"
              ? {
                  ignore_reason_code: options?.ignoreReason ?? "intentionally_skipped",
                  ignore_note: "Reviewed during guided onboarding data cleanup.",
                }
              : {}),
          }),
        });
        if (!response.ok) throw new Error(await readJsonError(response, "Unable to apply this fix"));
        setConfirmHighRiskId(null);
        setIgnoreItemId(null);
        await loadReview();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Unable to apply this fix");
      } finally {
        setBusyItemId(null);
      }
    },
    [loadReview],
  );

  if (!intakeId) return null;

  if (loading && !payload) {
    return (
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
        <p className="text-sm text-[color:var(--theme-text-secondary)]">Checking imported data for items that need your review…</p>
      </section>
    );
  }

  if (!loading && payload && unresolvedItems.length === 0) {
    return (
      <section className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-5 shadow-[var(--theme-shadow-medium)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Data cleanup complete</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--theme-text-primary)]">Your imported shop data is ready</h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Every flagged customer, vehicle, history, invoice, and part row has been handled.
            </p>
          </div>
          <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            0 items remaining
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-400/30 bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-medium)]">
      <div className="border-b border-[color:var(--theme-border-soft)] bg-amber-500/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Imported data cleanup</p>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
              A few rows need a quick decision
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
              ProFixIQ imported everything it could safely verify. Review only the exceptions below; each card explains what happened and recommends the safest fix.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3">
              <p className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">{unresolvedItems.length}</p>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">Need review</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3">
              <p className="text-2xl font-semibold text-red-300">
                {unresolvedItems.filter((item) => item.status === "failed_materialization").length}
              </p>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">Retry needed</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3">
              <p className="text-2xl font-semibold text-amber-300">{payload?.summary.blockers_total ?? 0}</p>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">Blocking launch</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {error ? (
          <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {DOMAIN_FILTERS.map((domain) => {
            const count = domain.key === "all" ? unresolvedItems.length : countsByDomain.get(domain.key) ?? 0;
            if (domain.key !== "all" && count === 0) return null;
            const selected = filter === domain.key;
            return (
              <button
                key={domain.key}
                type="button"
                onClick={() => setFilter(domain.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selected
                    ? "border-amber-300/60 bg-amber-400/15 text-amber-200"
                    : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]"
                }`}
              >
                {domain.label} · {count}
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-4">
          {visibleItems.map((item) => {
            const failed = item.status === "failed_materialization";
            const highRisk = isHighRisk(item);
            const recommendationAction = resolutionForRecommendation(item.recommendation.recommendedAction);
            const confirmingHighRisk = confirmHighRiskId === item.id;
            const ignoring = ignoreItemId === item.id;
            const busy = busyItemId === item.id;

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                        {domainLabel(item.domain)}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        failed
                          ? "border-red-400/30 bg-red-500/10 text-red-200"
                          : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                      }`}>
                        {failed ? "Fix failed — retry available" : "Needs review"}
                      </span>
                      {item.blocking_reason ? (
                        <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-200">
                          Blocks launch
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[color:var(--theme-text-primary)]">
                      {item.summary || `${domainLabel(item.domain)} row needs review`}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
                      {failed && item.materialization_error
                        ? item.materialization_error
                        : item.review_explanation}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 lg:w-72">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                        ProFixIQ recommends
                      </p>
                      <span className="text-xs font-semibold text-emerald-300">
                        {Math.round(item.recommendation.recommendationConfidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {recommendedActionLabel(item.recommendation.recommendedAction, failed)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      {item.recommendation_explanation}
                    </p>
                  </div>
                </div>

                <details className="mt-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
                  <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                    See source and normalized data
                  </summary>
                  <div className="grid gap-3 border-t border-[color:var(--theme-border-soft)] p-3 lg:grid-cols-2">
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[color:var(--theme-surface-page)] p-3 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                      {JSON.stringify(item.raw_payload ?? {}, null, 2)}
                    </pre>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[color:var(--theme-surface-page)] p-3 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                      {JSON.stringify(item.normalized_payload ?? {}, null, 2)}
                    </pre>
                  </div>
                </details>

                {confirmingHighRisk ? (
                  <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
                    <p className="text-sm font-semibold text-red-200">Confirm this duplicate or conflict decision</p>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                      This may connect imported history to an existing record. Confirm only after checking the suggested match and source data.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolveItem(item, recommendationAction, { confirmHighRisk: true })}
                        className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "Applying…" : "Confirm and apply"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmHighRiskId(null)}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm text-[color:var(--theme-text-primary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {ignoring ? (
                  <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
                    <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]" htmlFor={`ignore-${item.id}`}>
                      Why should this row be ignored?
                    </label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <select
                        id={`ignore-${item.id}`}
                        value={ignoreReason}
                        onChange={(event) => setIgnoreReason(event.target.value as typeof ignoreReason)}
                        className="min-w-0 flex-1 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                      >
                        {IGNORE_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>{reason.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolveItem(item, "ignored", { ignoreReason })}
                        className="rounded-xl bg-[color:var(--theme-text-primary)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-surface-page)] disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Ignore this row"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setIgnoreItemId(null)}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm text-[color:var(--theme-text-primary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {!confirmingHighRisk && !ignoring ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (highRisk) {
                          setConfirmHighRiskId(item.id);
                          return;
                        }
                        if (recommendationAction === "ignored") {
                          setIgnoreItemId(item.id);
                          return;
                        }
                        void resolveItem(item, recommendationAction);
                      }}
                      className="rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] disabled:opacity-50"
                    >
                      {busy ? "Applying…" : recommendedActionLabel(item.recommendation.recommendedAction, failed)}
                    </button>
                    {recommendationAction !== "ignored" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setIgnoreReason("intentionally_skipped");
                          setIgnoreItemId(item.id);
                        }}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-secondary)] disabled:opacity-50"
                      >
                        Ignore instead
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
