"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";
import { format } from "date-fns";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle  = DB["public"]["Tables"]["vehicles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "email" | "phone"> | null;
  vehicles:  Pick<Vehicle, "year" | "make" | "model" | "license_plate" | "vin"> | null;
};

export default function WorkOrdersHistoryClient(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // simple filters
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<string>(""); // yyyy-mm-dd
  const [to, setTo] = useState<string>("");     // yyyy-mm-dd

  async function load() {
    setLoading(true);
    setErr(null);

    // Base: completed work orders only
    let query = supabase
      .from("work_orders")
      .select(`
        *,
        customers:customers(first_name,last_name,email,phone),
        vehicles:vehicles(year,make,model,license_plate,vin)
      `)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(200);

    // optional date range (by updated_at)
    if (from) query = query.gte("updated_at", new Date(from).toISOString());
    if (to)   query = query.lte("updated_at", new Date(new Date(to).setHours(23,59,59,999)).toISOString());

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
            .filter(Boolean).join(" ").toLowerCase();
          const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";
          const vin   = r.vehicles?.vin?.toLowerCase() ?? "";
          const ymm  = [r.vehicles?.year ?? "", r.vehicles?.make ?? "", r.vehicles?.model ?? ""]
            .join(" ").toLowerCase();
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
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  // Export: CSV of current rows
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
      "Invoice URL"
    ];
    const lines = rows.map((r) => {
      const customer = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""].filter(Boolean).join(" ");
      const vehicle = r.vehicles ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim() : "";
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
        r.invoice_url ?? r.quote_url ?? ""
      ].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",");
    });

    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-order-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-orange-400">Work Order History</h1>

        <div className="ml-auto flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search id, custom id, name, VIN, plate, YMM…"
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            aria-label="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            aria-label="To date"
          />
          <button
            onClick={load}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Apply
          </button>

          <button
            onClick={() => window.print()}
            className="rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm hover:bg-black"
          >
            Print
          </button>
          <button
            onClick={exportCSV}
            className="rounded bg-purple-600 px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-500"
          >
            Export CSV
          </button>
        </div>
      </div>

      {err && <div className="mb-3 rounded bg-red-500/10 p-2 text-red-300 text-sm">{err}</div>}

      {loading ? (
        <div className="text-neutral-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-neutral-400">No completed work orders found.</div>
      ) : (
        <div className="divide-y divide-neutral-800 border border-neutral-800 rounded bg-neutral-900">
          {rows.map((r) => {
            const updated = r.updated_at ? format(new Date(r.updated_at), "PPpp") : "—";
            const customer = r.customers
              ? [r.customers.first_name ?? "", r.customers.last_name ?? ""].filter(Boolean).join(" ")
              : "—";
            const vehicle = r.vehicles
              ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim()
              : "—";
            const plate = r.vehicles?.license_plate ? `(${r.vehicles.license_plate})` : "";
            const vin = r.vehicles?.vin ? `VIN: ${r.vehicles.vin}` : "";

            return (
              <div key={r.id} className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/work-orders/view/${r.id}`}
                      className="font-medium underline underline-offset-2 decoration-neutral-600 hover:decoration-orange-500"
                    >
                      {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                    </Link>
                    {r.custom_id && (
                      <span className="text-[10px] rounded border border-neutral-700 px-1 py-0.5 text-neutral-300">
                        #{r.id.slice(0, 6)}
                      </span>
                    )}
                    <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">completed</span>
                    <span className="text-xs text-neutral-400">{updated}</span>
                  </div>

                  <div className="text-sm text-neutral-300 truncate">
                    {customer} • {vehicle} {plate} {vin && `• ${vin}`}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {r.invoice_url ? (
                    <a
                      href={r.invoice_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                    >
                      Open Invoice
                    </a>
                  ) : r.quote_url ? (
                    <a
                      href={r.quote_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                    >
                      Open Quote
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-500">No invoice</span>
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
