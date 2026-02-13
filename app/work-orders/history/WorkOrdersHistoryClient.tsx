// app/work-orders/history/WorkOrderHistoryCient.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";
import { format } from "date-fns";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "email" | "phone"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate" | "vin"> | null;
};

function fmtCustomerName(c: Row["customers"]): string {
  if (!c) return "—";
  const name = [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ").trim();
  return name.length ? name : "—";
}

function fmtVehicle(v: Row["vehicles"]): string {
  if (!v) return "—";
  const s = `${v.year ?? ""} ${v.make ?? ""} ${v.model ?? ""}`.trim();
  return s.length ? s : "—";
}

function statusMeta(status: string | null | undefined): { label: string; className: string } {
  const s = (status ?? "").toLowerCase();

  switch (s) {
    case "queued":
      return { label: "Queued", className: "border-sky-400/55 bg-sky-500/10 text-sky-200" };
    case "awaiting_approval":
      return { label: "Awaiting approval", className: "border-amber-400/55 bg-amber-500/10 text-amber-200" };
    case "ready_to_invoice":
      return { label: "Ready to invoice", className: "border-orange-400/55 bg-orange-500/10 text-orange-200" };
    case "invoiced":
      return { label: "Invoiced", className: "border-indigo-400/55 bg-indigo-500/10 text-indigo-200" };
    case "paid":
      return { label: "Paid", className: "border-emerald-400/55 bg-emerald-500/10 text-emerald-200" };
    case "completed":
      return { label: "Completed", className: "border-emerald-400/55 bg-emerald-500/10 text-emerald-200" };
    default:
      return { label: status ? String(status) : "—", className: "border-white/15 bg-white/5 text-neutral-200" };
  }
}

export default function WorkOrdersHistoryClient(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shopId, setShopId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // ---- Load current user's shop ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setErr("You must be signed in to view work order history.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "shop_id">>();

      if (cancelled) return;

      if (profErr) {
        setErr(profErr.message);
        setLoading(false);
        return;
      }

      if (!profile?.shop_id) {
        setErr("No shop is linked to your profile yet.");
        setLoading(false);
        return;
      }

      setShopId(profile.shop_id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ---- Load work orders for this shop (any status) ----
  const load = useCallback(async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    // IMPORTANT:
    // Do NOT call .returns<Row[]>() here — it changes the builder type and removes .gte/.lte typings.
    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,email,phone),
        vehicles:vehicles(year,make,model,license_plate,vin)
      `,
      )
      .eq("shop_id", shopId)
      .order("updated_at", { ascending: false })
      .limit(300);

    if (from) {
      query = query.gte("updated_at", new Date(from + "T00:00:00Z").toISOString());
    }

    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte("updated_at", toEnd.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as unknown as Row[];

    const qlc = q.trim().toLowerCase();
    const filtered = qlc
      ? list.filter((r) => {
          const name = fmtCustomerName(r.customers).toLowerCase();
          const plate = (r.vehicles?.license_plate ?? "").toLowerCase();
          const vin = (r.vehicles?.vin ?? "").toLowerCase();
          const ymm = fmtVehicle(r.vehicles).toLowerCase();
          const cid = (r.custom_id ?? "").toLowerCase();
          const status = (r.status ?? "").toLowerCase();

          return (
            r.id.toLowerCase().includes(qlc) ||
            cid.includes(qlc) ||
            name.includes(qlc) ||
            plate.includes(qlc) ||
            vin.includes(qlc) ||
            ymm.includes(qlc) ||
            status.includes(qlc)
          );
        })
      : list;

    setRows(filtered);
    setLoading(false);
  }, [supabase, shopId, from, to, q]);

  useEffect(() => {
    if (!shopId) return;
    void load();
  }, [load, shopId]);

  function exportCSV() {
    const header = [
      "WO ID",
      "Custom ID",
      "Status",
      "Updated",
      "Customer",
      "Email",
      "Phone",
      "Vehicle",
      "Plate",
      "VIN",
      "Invoice URL (portal)",
      "Quote URL",
      "App Invoice Page",
    ];

    const lines = rows.map((r) => {
      const customer = fmtCustomerName(r.customers);
      const vehicle = fmtVehicle(r.vehicles);
      const updated = r.updated_at ? format(new Date(r.updated_at), "yyyy-MM-dd HH:mm") : "";
      const appInvoice = `/work-orders/${r.id}/invoice`;

      return [
        r.id,
        r.custom_id ?? "",
        r.status ?? "",
        updated,
        customer,
        r.customers?.email ?? "",
        r.customers?.phone ?? "",
        vehicle,
        r.vehicles?.license_plate ?? "",
        r.vehicles?.vin ?? "",
        r.invoice_url ?? "",
        r.quote_url ?? "",
        appInvoice,
      ]
        .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });

    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-order-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),#020617_82%)] px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[var(--metal-border-soft)] bg-[radial-gradient(circle_at_top,_#050910,_#020308_65%,_#000)] px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.95)] sm:px-6 sm:py-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1">
              <span className="text-[0.7rem] font-blackops uppercase tracking-[0.22em] text-neutral-200">
                Work Order History
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              All work orders for your shop (any status). Search, filter by date, export for reporting.
            </p>
          </div>

          <div className="ml-auto text-right text-xs text-neutral-400">
            <div>
              <span className="font-mono text-sm font-semibold text-orange-400">
                {rows.length.toString().padStart(2, "0")}
              </span>{" "}
              <span className="uppercase tracking-[0.14em] text-neutral-500">Loaded</span>
            </div>
            {from || to ? (
              <div className="mt-0.5 font-mono text-[11px] text-neutral-500">
                Range: {from || "…"} → {to || "…"}
              </div>
            ) : (
              <div className="mt-0.5 text-[11px] text-neutral-500">Showing last {rows.length} records loaded</div>
            )}
          </div>
        </div>

        {/* Filters bar */}
        <div className="mb-5 rounded-2xl border border-[var(--metal-border-soft)] bg-black/60 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)] sm:p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="ID, custom ID, status, name, VIN, plate, YMM…"
                className="w-full rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 transition-colors focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
                aria-label="From date"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-black/70 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-orange-400 focus:ring-1 focus:ring-orange-500/70"
                aria-label="To date"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={load}
                className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/80"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-neutral-700 bg-black/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900"
              >
                Print
              </button>
              <button
                type="button"
                onClick={exportCSV}
                className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_18px_rgba(212,118,49,0.7)] hover:brightness-110"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="mb-4 rounded-xl border border-red-500/60 bg-red-950/80 px-4 py-2 text-sm text-red-100">
            {err}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="rounded-2xl border border-dashed border-[var(--metal-border-soft)] bg-black/60 p-6 text-sm text-neutral-400">
            Loading work orders…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--metal-border-soft)] bg-black/60 p-6 text-sm text-neutral-400">
            No work orders found for this shop and date range.
          </div>
        ) : (
          <div className="grid gap-2">
            {rows.map((r) => {
              const updated = r.updated_at ? format(new Date(r.updated_at), "PPpp") : "—";
              const customer = fmtCustomerName(r.customers);
              const vehicle = fmtVehicle(r.vehicles);
              const plate = r.vehicles?.license_plate ? `(${r.vehicles.license_plate})` : "";
              const vin = r.vehicles?.vin ? `VIN: ${r.vehicles.vin}` : "";

              const meta = statusMeta(r.status);

              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-2xl border border-[var(--metal-border-soft)] bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.24),_#020617_75%)]/90 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.9)] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/work-orders/view/${r.id}`}
                        className="font-mono text-sm text-orange-300 underline decoration-transparent underline-offset-2 hover:decoration-orange-400"
                      >
                        {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                      </Link>

                      {r.custom_id ? (
                        <span className="rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
                          #{r.id.slice(0, 6)}
                        </span>
                      ) : null}

                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                          meta.className
                        }
                      >
                        {meta.label}
                      </span>

                      <span className="text-[11px] text-neutral-400">{updated}</span>
                    </div>

                    <div className="mt-1 truncate text-sm text-neutral-300">
                      {customer} • {vehicle} {plate} {vin && `• ${vin}`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={`/work-orders/invoice/${r.id}`}
                      className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/80"
                      title="Open invoice inside ProFixIQ (staff view)"
                    >
                      View Invoice
                    </Link>

                    {r.invoice_url ? (
                      <a
                        href={r.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-neutral-700 bg-black/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-300 hover:bg-black/80"
                        title="Open customer portal invoice link"
                      >
                        Portal Link
                      </a>
                    ) : r.quote_url ? (
                      <a
                        href={r.quote_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-neutral-700 bg-black/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-300 hover:bg-black/80"
                        title="Open quote link"
                      >
                        Open Quote
                      </a>
                    ) : (
                      <span className="text-[11px] text-neutral-500">No invoice</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}