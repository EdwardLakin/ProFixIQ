"use client";

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Followup = {
  id: string;
  work_order_id: string;
  service_visit_id: string | null;
  recommendation: string;
  disposition: string;
  status: string;
  estimated_amount: number | string | null;
  follow_up_at: string | null;
  notes: string | null;
  recommended_at: string;
  workOrderNumber?: string | null;
  customerName?: string | null;
  vehicleLabel?: string | null;
};

function operationKey(id: string, status: string): string {
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `mobile-followup:${id}:${status}:${entropy}`.slice(0, 280);
}

function money(value: number | string | null): string | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `$${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function dateLabel(value: string | null): string {
  if (!value) return "No follow-up date";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "No follow-up date";
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dispositionLabel(value: string): string {
  if (value === "contact_later") return "Contact later";
  if (value === "monitor") return "Monitor";
  return "Quote later";
}

export default function MobileServiceFollowupQueue() {
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/service/followups", {
        credentials: "include",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | { followups?: Followup[]; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Follow-ups could not be loaded.");
      }
      setItems(Array.isArray(body?.followups) ? body.followups : []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Follow-ups could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = useCallback(
    async (item: Followup, status: "quoted" | "dismissed") => {
      if (busyId) return;
      setBusyId(item.id);
      setError(null);
      const key = operationKey(item.id, status);
      try {
        const response = await fetch(
          `/api/mobile/service/followups/${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({ status, operationKey: key }),
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(body?.error || "Follow-up could not be updated.");
        }
        setItems((current) => current.filter((row) => row.id !== item.id));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Follow-up could not be updated.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-8 pt-3 text-[color:var(--theme-text-primary)] sm:px-4">
      <header className="flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950 p-4 text-white shadow-card">
        <Link
          href="/mobile/service"
          className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07]"
          aria-label="Back to Mobile Service"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-sky-300">
            Future work
          </div>
          <h1 className="text-xl font-extrabold">Follow-ups</h1>
          <p className="text-xs text-slate-300">
            Opportunities captured in the field without slowing today&apos;s repair.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh follow-ups"
          className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.07] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4.5 w-4.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="h-36 animate-pulse rounded-3xl bg-[color:var(--theme-surface-panel)]" />
      ) : items.length === 0 ? (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6 text-center shadow-card">
          <Sparkles className="mx-auto h-8 w-8 text-sky-400" />
          <h2 className="mt-2 text-lg font-extrabold">Nothing waiting</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Recommendations stay here until they are quoted or dismissed.
          </p>
        </section>
      ) : (
        <section className="space-y-2">
          {items.map((item) => {
            const amount = money(item.estimated_amount);
            const busy = busyId === item.id;
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                      <span>{dispositionLabel(item.disposition)}</span>
                      {item.workOrderNumber ? (
                        <span>WO {item.workOrderNumber}</span>
                      ) : null}
                    </div>
                    <h2 className="mt-1 text-base font-extrabold leading-snug">
                      {item.recommendation}
                    </h2>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {[item.customerName, item.vehicleLabel]
                        .filter(Boolean)
                        .join(" · ") || "Linked work order"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {dateLabel(item.follow_up_at)}
                      </span>
                      {amount ? (
                        <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-1 font-bold">
                          {amount} rough
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Link
                    href={`/mobile/work-orders/${encodeURIComponent(item.work_order_id)}`}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 text-xs font-bold"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open WO
                  </Link>
                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void updateStatus(item, "quoted")}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-2 text-xs font-extrabold text-white disabled:opacity-40"
                  >
                    {busy ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Quoted
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyId)}
                    onClick={() => void updateStatus(item, "dismissed")}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[color:var(--theme-border-soft)] px-2 text-xs font-bold text-[color:var(--theme-text-secondary)] disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" /> Dismiss
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
