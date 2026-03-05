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

  recommendedText?: string | null;

  partsTotal: number;
  laborTotal: number;

  showActions?: boolean;
  onApprove?: () => void;
  onDecline?: () => void;
  onDefer?: () => void;

  footerNote?: string | null; // optional tiny footer line
}) {
  const {
    title,
    statusLabel,
    statusTone = "bad",
    issueText,
    photoUrl,
    recommendedText,
    partsTotal,
    laborTotal,
    showActions = true,
    onApprove,
    onDecline,
    onDefer,
    footerNote,
  } = props;

  const total = partsTotal + laborTotal;

  const dotCls =
    statusTone === "bad"
      ? "bg-red-500"
      : statusTone === "warn"
        ? "bg-amber-500"
        : statusTone === "ok"
          ? "bg-emerald-500"
          : "bg-neutral-500";

  const card =
    "rounded-2xl border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.65)]";
  const codeBox =
    "mt-2 rounded-xl border border-white/10 bg-black/55 px-4 py-3 text-sm text-neutral-200 whitespace-pre-wrap";

  return (
    <div className={card} style={{ ["--copper" as never]: COPPER }}>
      <div className="px-5 pt-5">
        <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
          Customer portal:
        </div>

        <div className="mt-2 text-2xl font-semibold text-white">{title}</div>

        <div className="mt-3 flex items-center gap-2">
          <span className={`h-3.5 w-3.5 rounded-full ${dotCls}`} />
          <div className="text-xl font-semibold text-white">{statusLabel}</div>
        </div>

        {/* Issue found */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">Issue Found</div>
          <div className={codeBox}>{safeTrim(issueText) || "—"}</div>
        </div>

        {/* Photo */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">
            📷 Inspection Photo
          </div>
          <div className="mt-2 rounded-xl border border-white/10 bg-black/55 p-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Inspection"
                className="h-auto w-full rounded-lg object-cover"
              />
            ) : (
              <div className="text-sm text-neutral-400">(image)</div>
            )}
          </div>
        </div>

        {/* Recommended */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-neutral-200">
            🛠 Recommended Repair
          </div>
          <div className={codeBox}>{safeTrim(recommendedText) || "—"}</div>
        </div>

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
            <div className="text-sm font-semibold text-neutral-200">
              Approve / Decline
            </div>
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
        <div className="mt-5 border-t border-white/10 px-5 py-3 text-xs text-neutral-500">
          {footerNote}
        </div>
      ) : (
        <div className="h-5" />
      )}
    </div>
  );
}
