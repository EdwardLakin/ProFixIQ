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
          : "bg-neutral-500";

  const card =
    "rounded-2xl border border-slate-300/15 bg-slate-950/55 shadow-[0_20px_48px_rgba(2,6,23,0.65)]";
  const codeBox =
    "mt-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-neutral-200 whitespace-pre-wrap";

  return (
    <div className={card} style={{ ["--copper" as never]: COPPER }}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="text-xl font-semibold text-white">{title}</div>

        <div className="mt-2 flex items-center gap-2">
          <span className={`h-3.5 w-3.5 rounded-full ${dotCls}`} />
          <div className="text-sm font-semibold text-white">{statusLabel}</div>
        </div>

        {/* Issue found */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">Issue Found</div>
          <div className={codeBox}>{safeTrim(issueText) || "—"}</div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">Evidence photo</div>
          {imageList.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {imageList.slice(0, 3).map((url, idx) => (
                <a
                  key={`${url}-${idx}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/70"
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
            <div className="mt-2 rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-neutral-400">
              No photo attached for this recommendation.
            </div>
          )}
        </div>

        {/* Recommended */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">
            🛠 Recommended Repair
          </div>
          <div className={codeBox}>{safeTrim(recommendedText) || "—"}</div>
        </div>


        {(whyRecommended.length > 0 || supportingEvidence.length > 0 || deferredConsequence) ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/55 px-4 py-3 text-sm text-neutral-200">
            {whyRecommended.length > 0 ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-300">Why recommended</div>
                <ul className="mt-1 space-y-1 text-xs text-neutral-300">
                  {whyRecommended.slice(0, 3).map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {supportingEvidence.length > 0 ? (
              <div className="mt-2">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-300">What supports this</div>
                <ul className="mt-1 space-y-1 text-xs text-neutral-400">
                  {supportingEvidence.slice(0, 3).map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {deferredConsequence ? (
              <div className="mt-2 text-xs text-neutral-400">What happens if deferred: {deferredConsequence}</div>
            ) : null}
          </div>
        ) : null}

        {/* Cost */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">$ Cost</div>
          <div className={codeBox}>
            {`Parts: ${fmtCurrency(partsTotal)}\nLabor: ${fmtCurrency(
              laborTotal,
            )}\nTotal: ${fmtCurrency(total)}`}
          </div>
        </div>

        {showActions ? (
          <div className="mt-5">
            <div className="text-sm font-semibold text-neutral-200">Decision</div>
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
        <div className="mt-4 border-t border-white/10 px-4 py-2.5 text-xs text-neutral-500 sm:px-5">
          {footerNote}
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
}
