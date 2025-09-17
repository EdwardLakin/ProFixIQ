"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle  = DB["public"]["Tables"]["vehicles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

const statusBadge: Record<string, string> = {
  awaiting_approval: "bg-blue-100 text-blue-800",
  awaiting: "bg-blue-100 text-blue-800",
  queued: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  planned: "bg-purple-100 text-purple-800",
  new: "bg-gray-200 text-gray-800",
  completed: "bg-green-100 text-green-800",
};

export default function WorkOrdersView(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
          *,
          customers:customers(first_name,last_name,phone,email),
          vehicles:vehicles(year,make,model,license_plate)
        `,
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status) query = query.eq("status", status);

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
              .filter(Boolean)
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
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const chip = (s: string | null | undefined) =>
    `text-xs px-2 py-1 rounded ${
      statusBadge[(s ?? "awaiting") as keyof typeof statusBadge] ?? "bg-gray-200 text-gray-800"
    }`;

  async function handleDelete(id: string) {
    if (!confirm("Delete this work order? This cannot be undone.")) return;

    // optimistic UI
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));

    // Delete children first to avoid FK blocking
    const { error: lineErr } = await supabase.from("work_order_lines").delete().eq("work_order_id", id);
    if (lineErr) {
      alert("Failed to delete job lines: " + lineErr.message);
      setRows(prev);
      return;
    }

    const { error } = await supabase.from("work_orders").delete().eq("id", id);
    if (error) {
      alert("Failed to delete: " + error.message);
      setRows(prev);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-orange-400">Work Orders</h1>
        <Link
          href="/work-orders/create"
          className="rounded bg-orange-500 px-3 py-1.5 text-black font-semibold hover:bg-orange-600"
        >
          + New
        </Link>
        <div className="ml-auto flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search id, custom id, name, plate, YMM…"
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="awaiting_approval">Awaiting approval</option>
            <option value="awaiting">Awaiting</option>
            <option value="queued">Queued</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="planned">Planned</option>
            <option value="new">New</option>
            <option value="completed">Completed</option>
          </select>
          <button
            onClick={load}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="mb-3 rounded bg-red-500/10 p-2 text-red-300 text-sm">{err}</div>}

      {loading ? (
        <div className="text-neutral-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-neutral-400">No work orders found.</div>
      ) : (
        <div className="divide-y divide-neutral-800 border border-neutral-800 rounded bg-neutral-900">
          {rows.map((r) => (
            <div key={r.id} className="p-3 flex items-center gap-3">
              <div className="w-28 text-xs text-neutral-400">
                {r.created_at ? format(new Date(r.created_at), "PP") : "—"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {/* Link to the TECH VIEW page */}
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
                  <span className={chip(r.status)}>
                    {(r.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
                <div className="text-sm text-neutral-300 truncate">
                  {r.customers
                    ? `${[r.customers.first_name ?? "", r.customers.last_name ?? ""].filter(Boolean).join(" ")}`
                    : "—"}{" "}
                  •{" "}
                  {r.vehicles
                    ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""} ${
                        r.vehicles.license_plate ? `(${r.vehicles.license_plate})` : ""
                      }`
                    : "—"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Open → also to TECH VIEW */}
                <Link
                  href={`/work-orders/view/${r.id}`}
                  className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                >
                  Open
                </Link>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="rounded border border-red-600/60 text-red-300 px-2 py-1 text-sm hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}