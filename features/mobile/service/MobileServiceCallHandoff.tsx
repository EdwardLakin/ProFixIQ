"use client";

import { ArrowRight, BriefcaseBusiness, CheckCircle2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

function operationKey(visitId: string): string {
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mobile-service:${visitId}:create-work-order:${entropy}`.slice(0, 280);
}

export default function MobileServiceCallHandoff({
  visitId,
}: {
  visitId: string;
}) {
  const router = useRouter();
  const key = useRef(operationKey(visitId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startRepair() {
    if (busy || !visitId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/mobile/service-visits/${encodeURIComponent(visitId)}/work-order`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key.current,
          },
          body: JSON.stringify({ operationKey: key.current }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { workOrderId?: string; workOrderNumber?: string; error?: string }
        | null;
      if (!response.ok || !body?.workOrderId) {
        throw new Error(body?.error || "Work order could not be created.");
      }
      router.replace(
        `/mobile/work-orders/${encodeURIComponent(body.workOrderId)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Work order could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-3 pb-8 pt-4 text-[color:var(--theme-text-primary)] sm:px-4">
      <section className="rounded-3xl border border-white/10 bg-slate-950 p-5 text-white shadow-card">
        <div className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="mt-4 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
          Service call saved
        </div>
        <h1 className="mt-1 text-2xl font-extrabold">What happens next?</h1>
        <p className="mt-2 text-sm text-slate-300">
          The customer, vehicle, appointment and Service Visit are saved. Create
          the work order only when repair intake is starting.
        </p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="space-y-2 rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card">
        <button
          type="button"
          disabled={busy || !visitId}
          onClick={() => void startRepair()}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 text-base font-extrabold text-white disabled:opacity-40"
        >
          {busy ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <BriefcaseBusiness className="h-5 w-5" />
          )}
          {busy ? "Creating work order…" : "Start repair"}
        </button>

        <Link
          href="/mobile/service"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 text-sm font-bold"
        >
          Done for now <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
