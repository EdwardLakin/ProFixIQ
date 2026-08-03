"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

type QuoteLine = {
  id: string;
  description: string;
  status: string;
  stage: string;
  total: number;
  sentAt: string | null;
  approvedAt: string | null;
  declinedAt: string | null;
  needsDecision: boolean;
};

type BillingItem = {
  id: string;
  vehicleId: string;
  unitLabel: string;
  vehicleDescription: string;
  reference: string;
  status: string;
  approvalState: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  quoteLines: QuoteLine[];
  invoice: {
    id: string;
    versionNumber: number;
    lifecycleStatus: string;
    currency: "CAD" | "USD";
    total: number;
    paidTotal: number;
    refundedTotal: number;
    outstandingTotal: number;
    issuedAt: string | null;
  } | null;
  payments: Array<{
    id: string;
    amountCents: number;
    currency: "CAD" | "USD";
    status: string;
    createdAt: string | null;
  }>;
};

type Payload = {
  canApprove: boolean;
  canPay: boolean;
  decisionMode: "shop_recorded" | "fleet_self_service";
  summary: {
    approvals: number;
    invoices: number;
    byCurrency: Record<
      "CAD" | "USD",
      { outstanding: number; paid: number }
    >;
  };
  items: BillingItem[];
};

type Filter = "approvals" | "unpaid" | "paid" | "all";

function billingFilter(value?: string): Filter {
  return value && ["approvals", "unpaid", "paid", "all"].includes(value)
    ? (value as Filter)
    : "approvals";
}

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]";

function money(amount: number, currency: "CAD" | "USD" = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(amount || 0);
}

function CurrencyTotals({
  totals,
  kind,
}: {
  totals: Payload["summary"]["byCurrency"];
  kind: "outstanding" | "paid";
}) {
  const currencies = (["CAD", "USD"] as const).filter(
    (currency) => totals[currency][kind] !== 0,
  );
  const visible = currencies.length ? currencies : (["CAD"] as const);
  return (
    <div className="mt-3 space-y-0.5 text-sm font-semibold">
      {visible.map((currency) => (
        <div key={currency}>{money(totals[currency][kind], currency)}</div>
      ))}
    </div>
  );
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function FleetBillingWorkspace({
  routePrefix,
  initialWorkOrderId,
  initialFilter,
}: {
  routePrefix: "/fleet" | "/portal/fleet";
  initialWorkOrderId?: string;
  initialFilter?: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>(
    initialWorkOrderId ? "all" : billingFilter(initialFilter),
  );
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactMethod, setContactMethod] = useState<
    "phone" | "in_person" | "email" | "other"
  >("phone");
  const [decisionNote, setDecisionNote] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
        cache: "no-store",
        signal,
      });
      const body = (await response.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Unable to load fleet billing");
      setPayload(body);
      if (
        !initialWorkOrderId &&
        !initialFilter &&
        body.summary.approvals === 0
      ) {
        setFilter("unpaid");
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setError(
          cause instanceof Error ? cause.message : "Unable to load fleet billing",
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => {
    const items = payload?.items ?? [];
    const filtered =
      filter === "all"
        ? items
        : filter === "approvals"
          ? items.filter((item) =>
              item.quoteLines.some((line) => line.needsDecision),
            )
          : filter === "unpaid"
            ? items.filter(
                (item) => (item.invoice?.outstandingTotal ?? 0) > 0,
              )
            : items.filter(
                (item) =>
                  item.invoice &&
                  item.invoice.outstandingTotal <= 0 &&
                  item.invoice.paidTotal > 0,
              );
    if (!initialWorkOrderId) return filtered;
    return [...filtered].sort(
      (left, right) =>
        Number(right.id === initialWorkOrderId) -
        Number(left.id === initialWorkOrderId),
    );
  }, [filter, initialWorkOrderId, payload?.items]);

  async function decide(
    item: BillingItem,
    line: QuoteLine,
    decision: "approve" | "decline" | "defer",
  ) {
    const key = `${line.id}:${decision}`;
    setActiveAction(key);
    try {
      const response = await fetch("/api/fleet/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decide",
          workOrderId: item.id,
          quoteLineIds: [line.id],
          decision,
          operationKey: crypto.randomUUID(),
          contactMethod,
          note: decisionNote.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Decision could not be saved");
      toast.success(
        decision === "approve"
          ? "Estimate line approved"
          : decision === "decline"
            ? "Estimate line declined"
            : "Estimate line deferred",
      );
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Decision could not be saved");
    } finally {
      setActiveAction(null);
    }
  }

  async function pay(item: BillingItem) {
    setActiveAction(`${item.id}:pay`);
    try {
      const response = await fetch("/api/fleet/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: item.id, routePrefix }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !body.url) {
        throw new Error(body.error || "Payment checkout is unavailable");
      }
      window.location.assign(body.url);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Payment checkout is unavailable");
      setActiveAction(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Fleet billing
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Approvals & invoices</h1>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            Approve exact estimate lines, see issued invoices, and pay online without
            leaving the fleet workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {payload ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`${panel} p-4`}>
            <FileCheck2 size={17} className="text-sky-300" />
            <div className="mt-3 text-xl font-semibold">
              {payload.summary.approvals}
            </div>
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              Awaiting approval
            </div>
          </div>
          <div className={`${panel} p-4`}>
            <CreditCard size={17} className="text-sky-300" />
            <CurrencyTotals totals={payload.summary.byCurrency} kind="outstanding" />
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              Outstanding by currency
            </div>
          </div>
          <div className={`${panel} p-4`}>
            <CheckCircle2 size={17} className="text-sky-300" />
            <CurrencyTotals totals={payload.summary.byCurrency} kind="paid" />
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              Paid by currency
            </div>
          </div>
          <div className={`${panel} p-4`}>
            <ReceiptText size={17} className="text-sky-300" />
            <div className="mt-3 text-xl font-semibold">
              {payload.summary.invoices}
            </div>
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              Invoices
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap gap-2 border-b border-[color:var(--theme-border-soft)] p-3" role="tablist">
          {([
            ["approvals", "Need approval"],
            ["unpaid", "Unpaid"],
            ["paid", "Paid"],
            ["all", "All history"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                filter === value
                  ? "bg-sky-300 text-slate-950"
                  : "text-[color:var(--theme-text-secondary)] hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {payload?.decisionMode === "shop_recorded" &&
        payload.summary.approvals > 0 ? (
          <div className="grid gap-2 border-b border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-[180px_1fr]">
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Customer contact
              <select
                value={contactMethod}
                onChange={(event) =>
                  setContactMethod(
                    event.target.value as
                      | "phone"
                      | "in_person"
                      | "email"
                      | "other",
                  )
                }
                className="mt-1 h-10 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2"
              >
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
                <option value="email">Email</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">
              Decision note
              <input
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder="Who approved or declined, and any conditions"
                maxLength={1000}
                className="mt-1 h-10 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3"
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="p-5 text-sm text-red-300">{error}</p> : null}
        {loading && !payload ? (
          <p className="p-5 text-sm text-[color:var(--theme-text-secondary)]">
            Loading approvals and invoices…
          </p>
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300" />
            <p className="mt-3 text-sm font-medium">You are clear in this view</p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              The full record remains available under All history.
            </p>
          </div>
        ) : null}

        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {visible.map((item) => {
            const pendingLines = item.quoteLines.filter((line) => line.needsDecision);
            return (
              <article
                key={item.id}
                id={`billing-${item.id}`}
                className={
                  item.id === initialWorkOrderId
                    ? "bg-sky-300/5 p-4 ring-1 ring-inset ring-sky-300/30"
                    : "p-4"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`${routePrefix}/units/${item.vehicleId}`}
                        className="font-semibold text-sky-300 hover:underline"
                      >
                        {item.unitLabel}
                      </Link>
                      <span className="text-xs text-[color:var(--theme-text-muted)]">
                        {item.vehicleDescription}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {item.reference} • opened {date(item.createdAt)} • {item.status}
                    </p>
                  </div>
                  {item.invoice ? (
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {money(item.invoice.outstandingTotal, item.invoice.currency)} due
                      </div>
                      <div className="text-xs text-[color:var(--theme-text-muted)]">
                        Invoice v{item.invoice.versionNumber} • {item.invoice.lifecycleStatus.replaceAll("_", " ")}
                      </div>
                    </div>
                  ) : null}
                </div>

                {pendingLines.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-200">
                      Your decision
                    </p>
                    {pendingLines.map((line) => (
                      <div
                        key={line.id}
                        className="grid gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 lg:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <p className="text-sm font-medium">{line.description}</p>
                          <p className="mt-1 text-sm font-semibold text-amber-100">
                            {money(line.total, item.invoice?.currency ?? "CAD")}
                          </p>
                        </div>
                        {payload?.canApprove ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={
                                Boolean(activeAction) ||
                                (payload.decisionMode === "shop_recorded" &&
                                  !decisionNote.trim())
                              }
                              onClick={() => void decide(item, line, "approve")}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                            >
                              <Check size={14} />
                              {activeAction === `${line.id}:approve` ? "Saving…" : "Approve"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                Boolean(activeAction) ||
                                (payload.decisionMode === "shop_recorded" &&
                                  !decisionNote.trim())
                              }
                              onClick={() => void decide(item, line, "defer")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs disabled:opacity-50"
                            >
                              <Clock3 size={14} />
                              Defer
                            </button>
                            <button
                              type="button"
                              disabled={
                                Boolean(activeAction) ||
                                (payload.decisionMode === "shop_recorded" &&
                                  !decisionNote.trim())
                              }
                              onClick={() => void decide(item, line, "decline")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-300 disabled:opacity-50"
                            >
                              <X size={14} />
                              Decline
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-[color:var(--theme-text-muted)]">
                            A fleet approver must make this decision.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {item.quoteLines.length > 0 && pendingLines.length === 0 ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {item.quoteLines.map((line) => (
                      <div
                        key={line.id}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
                      >
                        <div className="flex justify-between gap-3 text-sm">
                          <span>{line.description}</span>
                          <span className="font-medium">
                            {money(line.total, item.invoice?.currency ?? "CAD")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs capitalize text-[color:var(--theme-text-muted)]">
                          {line.status.replaceAll("_", " ")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {item.invoice ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[color:var(--theme-surface-subtle)] p-3">
                    <div className="text-xs text-[color:var(--theme-text-secondary)]">
                      Total {money(item.invoice.total, item.invoice.currency)} • Paid{" "}
                      {money(item.invoice.paidTotal, item.invoice.currency)}
                      {item.invoice.issuedAt ? ` • Issued ${date(item.invoice.issuedAt)}` : ""}
                    </div>
                    {payload?.canPay && item.invoice.outstandingTotal > 0 ? (
                      <button
                        type="button"
                        disabled={
                                Boolean(activeAction) ||
                                (payload.decisionMode === "shop_recorded" &&
                                  !decisionNote.trim())
                              }
                        onClick={() => void pay(item)}
                        className="inline-flex items-center gap-2 rounded-lg bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                      >
                        <CreditCard size={14} />
                        {activeAction === `${item.id}:pay` ? "Opening Stripe…" : "Pay invoice"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
