"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

// ✅ Exclude null so <select> value is always a string (or "")
type Status = Exclude<WorkOrder["status"], null> | "ready_to_invoice" | "invoiced";

const BILLING_STATUSES: Status[] = ["completed", "ready_to_invoice", "invoiced"];

const BADGE: Record<string, string> = {
  completed: "bg-sky-900/20 border-sky-500/40 text-sky-200",
  ready_to_invoice: "bg-amber-900/20 border-amber-500/40 text-amber-200",
  invoiced: "bg-emerald-900/20 border-emerald-500/40 text-emerald-200",
};

const chip = (s: string | null | undefined) =>
  `inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
    BADGE[s ?? "completed"] ?? BADGE.completed
  }`;

const btnBase = "rounded-md border text-sm px-3 py-2 transition-colors";
const btnNeutral =
  btnBase + " border-white/15 bg-black/40 text-neutral-100 hover:bg-white/5";
const btnInfo =
  btnBase + " border-sky-500/60 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20";
const btnWarn =
  btnBase +
  " border-amber-400/70 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20";
const btnOk =
  btnBase +
  " border-emerald-400/70 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20";

export default function BillingPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,email),
        vehicles:vehicles(year,make,model,license_plate)
      `,
      )
      .order("updated_at", { ascending: false })
      .limit(100);

    if (status) {
      query = query.eq("status", status);
    } else {
      query = query.in("status", BILLING_STATUSES as unknown as string[]);
    }

    const { data, error } = await query;
    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const qlc = q.trim().toLowerCase();
    const filtered =
      qlc.length === 0
        ? (data as Row[])
        : (data as Row[]).filter((r) => {
            const name = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""]
              .join(" ")
              .toLowerCase();
            const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";
            const ymm = [r.vehicles?.year ?? "", r.vehicles?.make ?? "", r.vehicles?.model ?? ""]
              .join(" ")
              .toLowerCase();
            const cid = (r.custom_id ?? "").toLowerCase();

            return (
              r.id.toLowerCase().includes(qlc) ||
              cid.includes(qlc) ||
              name.includes(qlc) ||
              plate.includes(qlc) ||
              ymm.includes(qlc)
            );
          });

    setRows(filtered);
    setLoading(false);
  }, [q, status, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAiReview = useCallback(async (id: string) => {
    const res = await fetch(`/api/work-orders/${id}/ai-review`, { method: "POST" });
    const j = (await res.json()) as {
      ok: boolean;
      issues: { kind: string; lineId?: string; message: string }[];
      suggested?: unknown;
    };

    if (!res.ok || !j.ok) {
      alert(
        j.issues?.length
          ? `Found issues:\n- ${j.issues.map((i) => i.message).join("\n- ")}`
          : "AI review failed.",
      );
      return;
    }

    alert("AI review passed. You can mark Ready to Invoice.");
  }, []);

  const handleMarkReady = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/work-orders/${id}/mark-ready`, { method: "POST" });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Failed to mark ready.");
        return;
      }
      void load();
    },
    [load],
  );

  const handleInvoice = useCallback(
    async (id: string) => {
      if (!confirm("Create and email a Stripe invoice to the customer?")) return;
      const res = await fetch(`/api/work-orders/${id}/invoice`, { method: "POST" });
      const j = (await res.json()) as { ok: boolean; stripeInvoiceId?: string; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? "Failed to create invoice.");
        return;
      }
      alert("Invoice created and emailed.");
      void load();
    },
    [load],
  );

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">Operations</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--accent-copper-light)]">
            Billing
          </h1>
        </div>

        <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="glass-card flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              placeholder="Search id, custom id, name, plate, YMM…"
              className="w-full bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none sm:w-72"
            />
          </div>

          <div className="glass-card flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-3 py-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status | "")}
              className="w-full bg-transparent text-sm text-neutral-100 focus:outline-none"
              aria-label="Filter by status"
            >
              <option value="">All (completed → invoiced)</option>
              <option value="completed">Completed</option>
              <option value="ready_to_invoice">Ready to invoice</option>
              <option value="invoiced">Invoiced</option>
            </select>
          </div>

          <button onClick={() => void load()} className={btnNeutral}>
            Refresh
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-300">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400">
          Nothing here yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {rows.map((r) => {
            const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;

            const customerName = r.customers
              ? [r.customers.first_name ?? "", r.customers.last_name ?? ""].filter(Boolean).join(" ") || "—"
              : "—";

            const vehicleText = r.vehicles
              ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim().replace(/\s+/g, " ")
              : "—";

            const plateText = r.vehicles?.license_plate ? `(${r.vehicles.license_plate})` : "";

            return (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0"
              >
                <div className="w-28 text-xs text-neutral-400">
                  {r.updated_at ? format(new Date(r.updated_at), "PP") : "—"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={href}
                      className="font-semibold text-neutral-100 underline decoration-white/10 underline-offset-4 hover:decoration-[var(--accent-copper-light)]"
                    >
                      {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                    </Link>

                    {/* keep ONE id display only (no duplicate “#” chips) */}
                    <span className={chip(r.status)}>
                      {String(r.status ?? "completed").replaceAll("_", " ")}
                    </span>
                  </div>

                  <div className="truncate text-sm text-neutral-300">
                    {customerName} • {vehicleText} {plateText}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void handleAiReview(r.id)}
                    className={btnInfo}
                    title="Run AI checklist"
                  >
                    AI Review
                  </button>

                  <button
                    onClick={() => void handleMarkReady(r.id)}
                    className={btnWarn + " disabled:opacity-50"}
                    disabled={r.status === "invoiced" || r.status === "ready_to_invoice"}
                    title="Mark as Ready to invoice"
                  >
                    Mark Ready
                  </button>

                  <button
                    onClick={() => void handleInvoice(r.id)}
                    className={btnOk + " disabled:opacity-50"}
                    disabled={r.status === "invoiced"}
                    title="Create & email Stripe invoice"
                  >
                    Invoice
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}