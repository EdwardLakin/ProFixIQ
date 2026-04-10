"use client";

import type { ExecutionPreview, OptimizationOpportunity } from "@/features/optimization/types";

type Props = {
  open: boolean;
  opportunity: OptimizationOpportunity | null;
  preview: ExecutionPreview | null;
  loadingPreview: boolean;
  applying: boolean;
  blockedReason?: string | null;
  applyError?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onRetry?: () => void;
};

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatCurrency(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return renderValue(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function renderInlineDiff(label: string, before: unknown, after: unknown) {
  const beforeSections = Array.isArray(before) ? before : null;
  const afterSections = Array.isArray(after) ? after : null;
  const isSectionDiff = label.toLowerCase().includes("section") && Array.isArray(afterSections);
  const isPrice = label.toLowerCase().includes("price");

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
      <div className="font-semibold text-neutral-100">{label}</div>
      {isSectionDiff ? (
        <div className="mt-1.5 space-y-1">
          {beforeSections && beforeSections.length > 0 ? (
            <div className="text-neutral-500">Existing: {beforeSections.join(", ")}</div>
          ) : null}
          {afterSections?.map((entry) => (
            <div key={String(entry)} className="text-emerald-300">
              + {String(entry)}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-white/10 bg-black/30 p-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Before</div>
            <div className="mt-1 text-neutral-300">{isPrice ? formatCurrency(before) : renderValue(before)}</div>
          </div>
          <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 p-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-300">After</div>
            <div className="mt-1 text-neutral-100">{isPrice ? formatCurrency(after) : renderValue(after)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OptimizationExecutionModal({
  open,
  opportunity,
  preview,
  loadingPreview,
  applying,
  blockedReason,
  applyError,
  onCancel,
  onConfirm,
  onRetry,
}: Props) {
  if (!open || !opportunity) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#101114] p-5 text-neutral-100 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Execution review</div>
        <h3 className="mt-1 text-lg font-semibold">{opportunity.title}</h3>

        <div className="mt-3 space-y-3 text-sm">
          <section className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">Summary</div>
            <p className="mt-1 text-neutral-300">{opportunity.explanation?.operational.summary ?? opportunity.summary}</p>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">What will happen</div>
            <p className="mt-1 text-neutral-300">
              {loadingPreview
                ? "Generating exact change preview..."
                : "Only the changes shown below will execute after confirmation."}
            </p>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">Why this matters</div>
            <ul className="mt-1.5 space-y-1 text-xs text-neutral-300">
              {(opportunity.explanation?.operational.bullets ?? opportunity.reasoning).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>
          {opportunity.explanation?.operational.evidence?.length ? (
            <section className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">What supports this</div>
              <ul className="mt-1.5 space-y-1 text-xs text-neutral-300">
                {opportunity.explanation.operational.evidence.slice(0, 4).map((item) => (
                  <li key={`${item.label}:${item.value ?? ""}`}>• {item.label}{item.value != null ? `: ${item.value}` : ""}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">Expected impact</div>
            <div className="mt-1 text-xs text-neutral-300">
              Confidence: {opportunity.confidenceLabel ?? `${Math.round(opportunity.confidence * 100)}% confidence`}
            </div>
            <div className="text-xs text-neutral-300">
              Estimated impact:{" "}
              {opportunity.impactLabel ??
                (typeof opportunity.estimatedValue === "number" ? `+$${Math.round(opportunity.estimatedValue)}/month` : "Potential impact detected")}
            </div>
            {opportunity.explanation?.operational.riskIfIgnored ? (
              <div className="mt-1 text-xs text-neutral-400">If deferred: {opportunity.explanation.operational.riskIfIgnored}</div>
            ) : null}
            {opportunity.explanation?.story?.isStoryWorthy ? (
              <div className="mt-1 text-xs text-sky-200">Story-worthy angle: {opportunity.explanation.story.angle ?? "Operational trust proof"}</div>
            ) : null}
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">Preview of changes</div>
            {preview ? (
              <div className="mt-2 space-y-2">
                {preview.changes.map((change) => (
                  <div key={change.label}>{renderInlineDiff(change.label, change.before, change.after)}</div>
                ))}
                {preview.warnings?.length ? (
                  <ul className="space-y-1 text-xs text-amber-300">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>⚠ {warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 text-xs text-neutral-400">Preview unavailable.</div>
            )}
          </section>

          {blockedReason ? (
            <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-xs text-red-200">{blockedReason}</div>
          ) : null}
          {applyError ? (
            <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-xs text-red-200">
              <div>Something went wrong.</div>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={applying}
                  className="mt-2 rounded-md border border-red-300/40 px-2 py-1 text-[11px] font-semibold text-red-100 disabled:opacity-50"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loadingPreview || applying || Boolean(blockedReason)}
            className="rounded-lg bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
          >
            {applying ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border border-black/40 border-t-black" />
                Applying…
              </span>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
