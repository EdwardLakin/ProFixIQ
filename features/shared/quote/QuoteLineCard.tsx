"use client";

import React from "react";

const COPPER = "#C57A4A";

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function fmtCurrency(n: number): string {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

type Tone = "bad" | "warn" | "ok" | "neutral";

export function QuoteLineCard(props: {
  title: string; // e.g. "Brake System" (or line label)
  statusLabel: string; // e.g. "Issue Found"
  statusTone?: Tone;

  issueText?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[] | null;

  recommendedText?: string | null;

  partsTotal: number;
  laborTotal: number;

  showActions?: boolean;
  onApprove?: () => void;
  onDecline?: () => void;
  onDefer?: () => void;

  footerNote?: string | null;
  whyRecommended?: string[];
  supportingEvidence?: string[];
  deferredConsequence?: string | null;
}) {
  const {
    title,
    statusLabel,
    statusTone = "bad",
    issueText,
    photoUrl,
    photoUrls,
    recommendedText,
    partsTotal,
    laborTotal,
    showActions = true,
    onApprove,
    onDecline,
    onDefer,
    footerNote,
    whyRecommended = [],
    supportingEvidence = [],
    deferredConsequence,
  } = props;

  const total = partsTotal + laborTotal;
  const imageList = Array.from(
    new Set([photoUrl, ...(Array.isArray(photoUrls) ? photoUrls : [])].filter(Boolean)),
  ) as string[];

  const dotCls =
    statusTone === "bad"
      ? "bg-red-500"
      : statusTone === "warn"
        ? "bg-amber-500"
        : statusTone === "ok"
          ? "bg-emerald-500"
          : "bg-[color:var(--theme-surface-subtle)]";

  const card =
    "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-[var(--theme-shadow-medium)]";
  const codeBox =
    "mt-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)] whitespace-pre-wrap";

  return (
    <div className={card} style={{ ["--copper" as never]: COPPER }}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="text-xl font-semibold text-[color:var(--theme-text-primary)]">{title}</div>

        <div className="mt-2 flex items-center gap-2">
          <span className={`h-3.5 w-3.5 rounded-full ${dotCls}`} />
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{statusLabel}</div>
        </div>

        {/* Issue found */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Issue Found</div>
          <div className={codeBox}>{safeTrim(issueText) || "—"}</div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Evidence photo</div>
          {imageList.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {imageList.slice(0, 3).map((url, idx) => (
                <a
                  key={`${url}-${idx}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Evidence ${idx + 1}`}
                    className="h-28 w-full object-cover"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
              No photo attached for this recommendation.
            </div>
          )}
        </div>

        {/* Recommended */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            🛠 Recommended Repair
          </div>
          <div className={codeBox}>{safeTrim(recommendedText) || "—"}</div>
        </div>


        {(whyRecommended.length > 0 || supportingEvidence.length > 0 || deferredConsequence) ? (
          <div className="mt-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-primary)]">
            {whyRecommended.length > 0 ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">Why recommended</div>
                <ul className="mt-1 space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {whyRecommended.slice(0, 3).map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {supportingEvidence.length > 0 ? (
              <div className="mt-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">What supports this</div>
                <ul className="mt-1 space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {supportingEvidence.slice(0, 3).map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {deferredConsequence ? (
              <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">What happens if deferred: {deferredConsequence}</div>
            ) : null}
          </div>
        ) : null}

        {/* Cost */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">$ Cost</div>
          <div className={codeBox}>
            {`Parts: ${fmtCurrency(partsTotal)}\nLabor: ${fmtCurrency(
              laborTotal,
            )}\nTotal: ${fmtCurrency(total)}`}
          </div>
        </div>

        {showActions ? (
          <div className="mt-5">
            <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Decision</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onApprove}
                className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/15"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={onDecline}
                className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-400/15"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={onDefer}
                className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/15"
              >
                Defer
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {footerNote ? (
        <div className="mt-4 border-t border-[color:var(--theme-border-soft)] px-4 py-2.5 text-xs text-[color:var(--theme-text-muted)] sm:px-5">
          {footerNote}
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
}
