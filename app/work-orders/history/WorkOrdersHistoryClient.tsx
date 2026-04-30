"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { format } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type HistoryRow = DB["public"]["Tables"]["history"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type Row = Pick<
  HistoryRow,
  "id" | "customer_id" | "vehicle_id" | "service_date" | "description" | "notes" | "created_at"
> & {
  customers: Pick<CustomerRow, "first_name" | "last_name" | "email" | "phone"> | null;
  vehicles: Pick<VehicleRow, "year" | "make" | "model" | "license_plate" | "vin" | "unit_number"> | null;
};

function fmtCustomerName(c: Row["customers"]): string {
  if (!c) return "—";
  const name = [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ").trim();
  return name.length ? name : "—";
}

function fmtVehicle(v: Row["vehicles"]): string {
  if (!v) return "—";
  const year = v.year != null ? String(v.year) : "";
  const main = [year, v.make ?? "", v.model ?? ""].filter(Boolean).join(" ").trim();
  const extra = [v.unit_number ? `Unit ${v.unit_number}` : "", v.license_plate ? `Plate ${v.license_plate}` : ""]
    .filter(Boolean)
    .join(" • ");
  return [main || "Vehicle", extra].filter(Boolean).join(" — ");
}

function fmtDate(iso: string | null | undefined, pattern = "PPpp"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, pattern);
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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setErr(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        setErr("You must be signed in to view service history.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<Pick<ProfileRow, "shop_id">>();

      if (cancelled) return;

      if (profileErr) {
        setErr(profileErr.message);
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

  const load = useCallback(async () => {
    if (!shopId) return;

    setLoading(true);
    setErr(null);

    let query = supabase
      .from("history")
      .select(
        "id, customer_id, vehicle_id, service_date, description, notes, created_at, customers:customers(first_name,last_name,email,phone), vehicles:vehicles(year,make,model,license_plate,vin,unit_number)",
      )
      .order("service_date", { ascending: false })
      .limit(300);

    if (from) {
      query = query.gte("service_date", new Date(`${from}T00:00:00Z`).toISOString());
    }

    if (to) {
      const toEnd = new Date(`${to}T00:00:00Z`);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte("service_date", toEnd.toISOString());
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
          const customer = fmtCustomerName(r.customers).toLowerCase();
          const vehicle = fmtVehicle(r.vehicles).toLowerCase();
          const plate = (r.vehicles?.license_plate ?? "").toLowerCase();
          const vin = (r.vehicles?.vin ?? "").toLowerCase();
          const description = (r.description ?? "").toLowerCase();
          const notes = (r.notes ?? "").toLowerCase();
          const date = fmtDate(r.service_date, "yyyy-MM-dd").toLowerCase();

          return (
            r.id.toLowerCase().includes(qlc) ||
            customer.includes(qlc) ||
            vehicle.includes(qlc) ||
            plate.includes(qlc) ||
            vin.includes(qlc) ||
            description.includes(qlc) ||
            notes.includes(qlc) ||
            date.includes(qlc)
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
    const header = ["History ID", "Service Date", "Customer", "Email", "Phone", "Vehicle", "Plate", "VIN", "Description", "Notes"];

    const lines = rows.map((r) => [
      r.id,
      fmtDate(r.service_date, "yyyy-MM-dd HH:mm"),
      fmtCustomerName(r.customers),
      r.customers?.email ?? "",
      r.customers?.phone ?? "",
      fmtVehicle(r.vehicles),
      r.vehicles?.license_plate ?? "",
      r.vehicles?.vin ?? "",
      r.description ?? "",
      r.notes ?? "",
    ].map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","));

    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `service-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] desktop-backdrop px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="overflow-hidden rounded-[26px] border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[0_18px_48px_rgba(2,6,23,0.58)]">
          <div className="border-b border-[color:var(--desktop-border)] bg-[linear-gradient(180deg,rgba(96,165,250,0.12),rgba(15,23,42,0.04))] px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1">
                  <span className="text-[0.7rem] font-blackops uppercase tracking-[0.22em] text-neutral-200">
                    Service History
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Read-only historical service records imported from onboarding. These are not active work orders.
                </p>
              </div>

              <div className="ml-auto text-right text-xs text-neutral-400">
                <div>
                  <span className="font-mono text-sm font-semibold text-sky-300">
                    {rows.length.toString().padStart(2, "0")}
                  </span>{" "}
                  <span className="uppercase tracking-[0.14em] text-neutral-500">Loaded</span>
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {from || to ? `Range: ${from || "…"} → ${to || "…"}` : `Showing last ${rows.length} records loaded`}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                  Search
                </label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load()}
                  placeholder="Customer, VIN, plate, description, notes…"
                  className="w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 transition-colors focus:border-sky-400/65 focus:ring-2 focus:ring-sky-500/25"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-sky-400/65 focus:ring-2 focus:ring-sky-500/25"
                  aria-label="From date"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-[0.18em] text-neutral-400">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-sky-400/65 focus:ring-2 focus:ring-sky-500/25"
                  aria-label="To date"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={load}
                  className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-sky-300/45 hover:bg-white/10"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={exportCSV}
                  className="rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100 hover:bg-sky-500/15"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="desktop-panel px-4 py-5 sm:px-6 sm:py-6">
          {err ? (
            <div className="mb-4 rounded-xl border border-red-500/60 bg-red-950/80 px-4 py-2 text-sm text-red-100">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-6 text-sm text-neutral-400">
              Loading service history…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-6 text-sm text-neutral-400">
              No service history found for this shop and date range.
            </div>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => {
                const serviceDate = fmtDate(r.service_date ?? r.created_at);
                const customer = fmtCustomerName(r.customers);
                const vehicle = fmtVehicle(r.vehicles);
                const plate = r.vehicles?.license_plate ? `(${r.vehicles.license_plate})` : "";
                const vin = r.vehicles?.vin ? `VIN: ${r.vehicles.vin}` : "";

                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-3 shadow-[0_14px_38px_rgba(0,0,0,0.9)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="font-mono text-sm text-sky-200">
                          History #{r.id.slice(0, 8)}
                        </div>
                        <div className="text-sm text-neutral-200">{customer}</div>
                        <div className="text-xs text-neutral-400">
                          {vehicle} {plate}
                        </div>
                        {vin ? <div className="text-[11px] text-neutral-500">{vin}</div> : null}
                      </div>

                      <div className="text-left text-xs text-neutral-400 sm:text-right">
                        <div className="font-mono text-sky-200">{serviceDate}</div>
                        <div className="mt-1 inline-flex rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100">
                          Read only
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-neutral-200">
                      {r.description || "Imported historical service record"}
                    </div>

                    {r.notes ? (
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-neutral-400">
                        {r.notes}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
