"use client";

import { ArrowLeft, CalendarClock, Save } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

function createKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `followup-${Date.now()}`;
}

export default function MobileServiceFollowup({
  workOrderId,
}: {
  workOrderId: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const visitId = search.get("visitId");
  const operationKey = useRef(createKey());
  const [recommendation, setRecommendation] = useState("");
  const [disposition, setDisposition] = useState<
    "quote_later" | "contact_later" | "monitor"
  >("quote_later");
  const [amount, setAmount] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!recommendation.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service/followups", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey.current,
        },
        body: JSON.stringify({
          workOrderId,
          serviceVisitId: visitId,
          recommendation: recommendation.trim(),
          disposition,
          estimatedAmount: amount ? Number(amount) : null,
          followUpAt: followUpAt
            ? new Date(followUpAt).toISOString()
            : null,
          notes: notes.trim() || null,
          operationKey: operationKey.current,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Recommendation could not be saved.");
      }
      router.back();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Recommendation could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-3 pb-8 pt-3 text-[color:var(--theme-text-primary)] sm:px-4">
      <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950 p-4 text-white shadow-card">
        <Link
          href="/mobile/service"
          className="inline-grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/[0.07]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
            Future work
          </div>
          <h1 className="text-xl font-extrabold">Add recommendation</h1>
          <p className="text-xs text-slate-300">
            {"Keeps it off today's invoice."}
          </p>
        </div>
      </header>

      <section className="space-y-3 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <textarea
          autoFocus
          rows={3}
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          placeholder="Replace all four tires before winter"
          className="w-full resize-none rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-base"
        />
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["quote_later", "Quote later"],
              ["contact_later", "Contact later"],
              ["monitor", "Monitor"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDisposition(value)}
              className={`min-h-11 rounded-xl border px-2 text-xs font-bold ${
                disposition === value
                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Rough amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="$ optional"
              className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-base"
            />
          </label>
          <label className="text-xs text-[color:var(--theme-text-secondary)]">
            Follow up
            <input
              value={followUpAt}
              onChange={(event) => setFollowUpAt(event.target.value)}
              type="datetime-local"
              className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-xs text-[color:var(--theme-text-secondary)]">
          Note
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional internal note"
            className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm"
          />
        </label>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy || !recommendation.trim()}
        onClick={() => void save()}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 text-base font-extrabold text-white disabled:opacity-40"
      >
        <Save className="h-5 w-5" />
        {busy ? "Saving…" : "Save for later"}
      </button>
      <p className="flex items-center justify-center gap-2 text-xs text-[color:var(--theme-text-muted)]">
        <CalendarClock className="h-4 w-4" />
        The current repair and invoice are unchanged.
      </p>
    </main>
  );
}
