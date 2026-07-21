// features/assistant/components/AssistantResponseCard.tsx

"use client";

import Link from "next/link";
import type { AssistantResponse } from "../types/assistant";
import { buildPlannerHref } from "../lib/buildPlannerHref";

type Props = {
  data: AssistantResponse | { error: string } | null;
  onConfirmAction?: (actionId: string) => void | Promise<void>;
  onCancelAction?: (actionId: string) => void | Promise<void>;
  actionLoading?: string | null;
  showAnswer?: boolean;
};

function fitmentLabel(value: string): string {
  if (value === "confirmed_fit") return "Confirmed fit";
  if (value === "likely_fit") return "Likely fit";
  if (value === "needs_review") return "Needs review";
  return "Unknown fit";
}

function normalizePlannerActionLabel(label: string): string {
  const lower = label.trim().toLowerCase();
  if (!lower || lower.includes("fix") || lower.includes("planner")) {
    return "Plan next steps";
  }
  return label;
}

function riskLabel(value: "low" | "medium" | "high"): string {
  if (value === "high") return "High-impact change";
  if (value === "medium") return "Operational change";
  return "Low-impact change";
}

export default function AssistantResponseCard({
  data,
  onConfirmAction,
  onCancelAction,
  actionLoading = null,
  showAnswer = true,
}: Props) {
  if (!data) return null;

  if ("error" in data) {
    return (
      <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200">
        {data.error}
      </div>
    );
  }

  const pending = data.pendingAction;
  const execution = data.execution;

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5">
      {pending ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
              Confirmation required
            </div>
            <div className="rounded-full border border-amber-300/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-100">
              {riskLabel(pending.riskLevel)}
            </div>
          </div>
          <div className="mt-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {pending.label}
          </div>
          <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            {pending.summary}
          </p>
          <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
            No record has changed yet. This request expires at{" "}
            {new Date(pending.expiresAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(actionLoading)}
              onClick={() => void onConfirmAction?.(pending.id)}
              className="rounded-full bg-[var(--accent-copper)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === pending.id ? "Working…" : "Confirm change"}
            </button>
            <button
              type="button"
              disabled={Boolean(actionLoading)}
              onClick={() => void onCancelAction?.(pending.id)}
              className="rounded-full border border-[color:var(--theme-border-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--theme-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {execution ? (
        <section
          className={`rounded-2xl border p-4 ${
            execution.status === "succeeded"
              ? "border-emerald-400/30 bg-emerald-500/10"
              : execution.status === "failed"
                ? "border-red-400/30 bg-red-500/10"
                : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            {execution.status === "succeeded"
              ? "Action completed"
              : execution.status === "failed"
                ? "Action failed"
                : "Action cancelled"}
          </div>
          <div className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {execution.summary}
          </div>
          {execution.details.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
              {execution.details.map((detail) => (
                <li key={detail}>• {detail}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {showAnswer ? (
        <section>
          <div className="mb-2 text-xs uppercase text-[color:var(--theme-text-secondary)]">
            Direct answer
          </div>
          <div className="whitespace-pre-line text-sm text-[color:var(--theme-text-primary)]">
            {data.summary}
          </div>

          {data.bullets.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-xs text-[color:var(--theme-text-secondary)]">
                Supporting evidence &amp; context
              </div>
              <ul className="space-y-1">
                {data.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="text-sm text-[color:var(--theme-text-primary)]"
                  >
                    • {bullet}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {data.partSuggestions && data.partSuggestions.length > 0 ? (
        <div className="space-y-2">
          <div className="mb-2 text-xs text-[color:var(--theme-text-secondary)]">
            Suggested parts (review first)
          </div>
          {data.partSuggestions.map((part) => (
            <div
              key={part.candidateId}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {part.title}
                  </div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {part.sku ? `${part.sku} • ` : ""}Qty{" "}
                    {part.quantitySuggestion} •{" "}
                    {fitmentLabel(part.fitmentConfidence)}
                  </div>
                </div>
                <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
                  rank {Math.round(part.rankScore)}
                </div>
              </div>
              <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
                {part.reviewRecommendation}
              </div>
              {part.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-300">
                  {part.warnings.slice(0, 2).map((warning) => (
                    <li key={`${part.candidateId}-${warning.type}`}>
                      • {warning.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {part.linkedEvidence.slice(0, 3).map((evidence) => (
                  <Link
                    key={evidence.id}
                    href={evidence.href ?? "#"}
                    className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[10px] text-[color:var(--theme-text-secondary)]"
                  >
                    {evidence.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data.relatedRecords && data.relatedRecords.length > 0 ? (
        <div className="space-y-2">
          <div className="mb-2 text-xs text-[color:var(--theme-text-secondary)]">
            Related records
          </div>
          {data.relatedRecords.slice(0, 6).map((record, index) => (
            <div
              key={`${record.id ?? record.label}-${record.href ?? index}`}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
            >
              {record.href ? (
                <Link
                  href={record.href}
                  className="text-sm font-semibold text-orange-200 hover:text-orange-100"
                >
                  {record.label}
                </Link>
              ) : (
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {record.label}
                </div>
              )}
              <div className="text-xs text-[color:var(--theme-text-secondary)]">
                {record.type ? record.type.replaceAll("_", " ") : "record"}
              </div>
            </div>
          ))}
        </div>
      ) : data.notifications.length > 0 ? (
        <div className="space-y-2">
          <div className="mb-2 text-xs text-[color:var(--theme-text-secondary)]">
            Related records
          </div>
          {data.notifications.slice(0, 3).map((notification, index) => (
            <div
              key={`${notification.code}-${notification.entityId ?? index}`}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
            >
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {notification.title}
              </div>
              <div className="text-xs text-[color:var(--theme-text-secondary)]">
                {notification.message}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data.actions.length > 0 ? (
        <div>
          <div className="mb-2 text-xs text-[color:var(--theme-text-secondary)]">
            Suggested next actions
          </div>
          <div className="flex flex-wrap gap-2">
            {data.actions.map((action, index) =>
              action.kind === "planner" ? (
                <Link
                  key={`${action.label}-${index}`}
                  href={buildPlannerHref(action.plannerPayload)}
                  className="rounded-full border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-xs text-orange-300"
                >
                  {normalizePlannerActionLabel(action.label)}
                </Link>
              ) : (
                <Link
                  key={`${action.href}-${index}`}
                  href={action.href}
                  className="rounded-full border border-orange-400/40 px-3 py-1 text-xs text-orange-300"
                >
                  {action.label}
                </Link>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
