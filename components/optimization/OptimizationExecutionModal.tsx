"use client";

import type { ExecutionPreview, OptimizationOpportunity } from "@/features/optimization/types";

type Props = {
  open: boolean;
  opportunity: OptimizationOpportunity | null;
  preview: ExecutionPreview | null;
  loadingPreview: boolean;
  applying: boolean;
  blockedReason?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
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

export default function OptimizationExecutionModal({
  open,
  opportunity,
  preview,
  loadingPreview,
  applying,
  blockedReason,
  onCancel,
  onConfirm,
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
            <p className="mt-1 text-neutral-300">{opportunity.summary}</p>
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
              {opportunity.reasoning.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-200">Preview of changes</div>
            {preview ? (
              <div className="mt-2 space-y-2">
                {preview.changes.map((change) => (
                  <div key={change.label} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                    <div className="font-semibold text-neutral-100">{change.label}</div>
                    <div className="mt-1 text-neutral-400">Before: {renderValue(change.before)}</div>
                    <div className="text-neutral-300">After: {renderValue(change.after)}</div>
                  </div>
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
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
