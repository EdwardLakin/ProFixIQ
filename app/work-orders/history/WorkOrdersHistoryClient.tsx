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

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "email" | "phone"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate" | "vin"> | null;
};

export default function WorkOrdersHistoryClient(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,email,phone),
        vehicles:vehicles(year,make,model,license_plate,vin)
      `
      )
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (from) query = query.gte("updated_at", new Date(from).toISOString());
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

    const list = (data ?? []) as Row[];

    const qlc = q.trim().toLowerCase();
    const filtered = qlc
      ? list.filter((r) => {
          const name = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";
          const vin = r.vehicles?.vin?.toLowerCase() ?? "";
          const ymm = [r.vehicles?.year ?? "", r.vehicles?.make ?? "", r.vehicles?.model ?? ""]
            .join(" ")
            .toLowerCase();
          const cid = (r.custom_id ?? "").toLowerCase();
          return (
            r.id.toLowerCase().includes(qlc) ||
            cid.includes(qlc) ||
            name.includes(qlc) ||
            plate.includes(qlc) ||
            vin.includes(qlc) ||
            ymm.includes(qlc)
          );
        })
      : list;

    setRows(filtered);
    setLoading(false);
  }, [supabase, from, to, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCSV() {
    const header = [
      "WO ID",
      "Custom ID",
      "Updated",
      "Customer",
      "Email",
      "Phone",
      "Vehicle",
      "Plate",
      "VIN",
      "Invoice URL",
    ];
    const lines = rows.map((r) => {
      const customer = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""]
        .filter(Boolean)
        .join(" ");
      const vehicle = r.vehicles
        ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim()
        : "";
      const updated = r.updated_at ? format(new Date(r.updated_at), "yyyy-MM-dd HH:mm") : "";
      return [
        r.id,
        r.custom_id ?? "",
        updated,
        customer,
        r.customers?.email ?? "",
        r.customers?.phone ?? "",
        vehicle,
        r.vehicles?.license_plate ?? "",
        r.vehicles?.vin ?? "",
        r.invoice_url ?? r.quote_url ?? "",
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
    <div className="mx-auto max-w-6xl p-6 bg-background text-foreground">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-orange-500 dark:text-orange-400">
          Work Order History
        </h1>

        <div className="ml-auto flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search id, custom id, name, VIN, plate, YMM…"
            className="rounded border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-orange-400 dark:bg-neutral-900"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-border bg-background px-3 py-1.5 text-sm focus:border-orange-400 dark:bg-neutral-900"
            aria-label="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-border bg-background px-3 py-1.5 text-sm focus:border-orange-400 dark:bg-neutral-900"
            aria-label="To date"
          />
          <button
            onClick={load}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted dark:hover:bg-neutral-800"
          >
            Apply
          </button>

          <button
            onClick={() => window.print()}
            className="rounded border border-border bg-muted px-3 py-1.5 text-sm hover:bg-muted/70 dark:bg-neutral-800"
          >
            Print
          </button>
          <button
            onClick={exportCSV}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500"
          >
            Export CSV
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-500">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-muted/30 p-6 text-muted-foreground">
          No completed work orders found.
        </div>
      ) : (
        <div className="divide-y divide-border rounded border border-border bg-card">
          {rows.map((r) => {
            const updated = r.updated_at ? format(new Date(r.updated_at), "PPpp") : "—";
            const customer = r.customers
              ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                  .filter(Boolean)
                  .join(" ")
              : "—";
            const vehicle = r.vehicles
              ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim()
              : "—";
            const plate = r.vehicles?.license_plate ? `(${r.vehicles.license_plate})` : "";
            const vin = r.vehicles?.vin ? `VIN: ${r.vehicles.vin}` : "";

            return (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/work-orders/${r.id}`}
                      className="font-medium underline underline-offset-2 decoration-border hover:decoration-orange-500"
                    >
                      {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                    </Link>
                    {r.custom_id && (
                      <span className="text-[10px] rounded border border-border px-1 py-0.5 text-muted-foreground">
                        #{r.id.slice(0, 6)}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                      completed
                    </span>
                    <span className="text-xs text-muted-foreground">{updated}</span>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {customer} • {vehicle} {plate} {vin && `• ${vin}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.invoice_url ? (
                    <a
                      href={r.invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-border px-2 py-1 text-sm hover:bg-muted"
                    >
                      Open Invoice
                    </a>
                  ) : r.quote_url ? (
                    <a
                      href={r.quote_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-border px-2 py-1 text-sm hover:bg-muted"
                    >
                      Open Quote
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">No invoice</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}