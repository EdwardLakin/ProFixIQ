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
  customers: Pick<
    Customer,
    "first_name" | "last_name" | "email" | "phone"
  > | null;
  vehicles: Pick<
    Vehicle,
    "year" | "make" | "model" | "license_plate" | "vin"
  > | null;
};

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
    (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setErr("You must be signed in to view work order history.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

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
  }, [supabase]);

  // ---- Load completed work orders for this shop ----
  const load = useCallback(async () => {
    if (!shopId) return;

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
      .eq("shop_id", shopId)
      .eq("status", "completed")
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
          const ymm = [
            r.vehicles?.year ?? "",
            r.vehicles?.make ?? "",
            r.vehicles?.model ?? "",
          ]
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
  }, [supabase, shopId, from, to, q]);

  // Initial load + reload when filters change via Apply button
  useEffect(() => {
    if (!shopId) return;
    void load();
  }, [load, shopId]);

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
        ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${
            r.vehicles.model ?? ""
          }`.trim()
        : "";
      const updated = r.updated_at
        ? format(new Date(r.updated_at), "yyyy-MM-dd HH:mm")
        : "";
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
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-blackops text-orange-500">
            Work Order History
          </h1>
          <p className="text-xs text-muted-foreground">
            Completed work orders for your shop. Search, filter by date, export for
            reporting.
          </p>
        </div>

        <div className="ml-auto text-right text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-orange-400">
              {rows.length}
            </span>{" "}
            completed work orders
          </div>
          {from || to ? (
            <div className="mt-0.5">
              Range:{" "}
              <span className="font-mono">
                {from || "…"} → {to || "…"}
              </span>
            </div>
          ) : (
            <div className="mt-0.5">Showing last {rows.length} records loaded</div>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="mb-4 rounded-xl border border-border bg-card/80 p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Search
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="ID, custom ID, name, VIN, plate, YMM…"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-500"
              aria-label="From date"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-500"
              aria-label="To date"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              className="rounded-md border border-border bg-muted/60 px-3 py-1.5 text-sm hover:bg-muted/90"
            >
              Apply
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-md border border-border bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              Print
            </button>
            <button
              onClick={exportCSV}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
          {err}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="rounded border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
          Loading completed work orders…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
          No completed work orders found for this shop and date range.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((r) => {
            const updated = r.updated_at
              ? format(new Date(r.updated_at), "PPpp")
              : "—";
            const customer = r.customers
              ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                  .filter(Boolean)
                  .join(" ")
              : "—";
            const vehicle = r.vehicles
              ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${
                  r.vehicles.model ?? ""
                }`.trim()
              : "—";
            const plate = r.vehicles?.license_plate
              ? `(${r.vehicles.license_plate})`
              : "";
            const vin = r.vehicles?.vin ? `VIN: ${r.vehicles.vin}` : "";

            return (
              <div
                key={r.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/work-orders/${r.id}`}
                      className="font-medium text-orange-400 underline decoration-transparent underline-offset-2 hover:decoration-orange-400"
                    >
                      {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                    </Link>
                    {r.custom_id && (
                      <span className="text-[10px] rounded border border-border px-1 py-0.5 font-mono text-muted-foreground">
                        #{r.id.slice(0, 6)}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-300">
                      Completed
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {updated}
                    </span>
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
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Open invoice
                    </a>
                  ) : r.quote_url ? (
                    <a
                      href={r.quote_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Open quote
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      No invoice
                    </span>
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