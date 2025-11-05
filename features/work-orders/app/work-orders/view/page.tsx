"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

/* --------------------------- Status badges (dark) --------------------------- */
type StatusKey =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const BADGE_BASE =
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium";

const STATUS_BADGE: Record<StatusKey, string> = {
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  awaiting: "bg-sky-900/20  border-sky-500/40  text-sky-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20  border-amber-500/40  text-amber-300",
  planned: "bg-purple-900/20 border-purple-500/40 text-purple-300",
  new: "bg-neutral-800   border-neutral-600   text-neutral-200",
  completed: "bg-green-900/20  border-green-500/40 text-green-300",
  ready_to_invoice: "bg-emerald-900/20 border-emerald-500/40 text-emerald-300",
  invoiced: "bg-teal-900/20    border-teal-500/40    text-teal-300",
};

const chip = (s: string | null | undefined) => {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey;
  const cls = STATUS_BADGE[key] ?? STATUS_BADGE.awaiting;
  return `${BADGE_BASE} ${cls}`;
};

/** “Normal flow” = tech/active; hides AA, completed, billing states */
const NORMAL_FLOW_STATUSES: StatusKey[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "planned",
  "new",
];

// roles that can assign techs from this view
const ASSIGN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

export default function WorkOrdersView(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(""); // "" = normal flow
  const [err, setErr] = useState<string | null>(null);

  // assigning
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [techs, setTechs] = useState<Array<Pick<Profile, "id" | "full_name" | "role">>>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");

  const [currentRole, setCurrentRole] = useState<string | null>(null);

  // load current user role (from profiles) + mechanics (from API) once
  useEffect(() => {
    (async () => {
      // get my role (this is still fine through RLS)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        setCurrentRole(prof?.role ?? null);
      }

      // mechanics / assignables come from server route so RLS doesn't block us
      try {
        const res = await fetch("/api/assignables");
        const json = await res.json();
        if (res.ok) {
          setTechs(json.data ?? []);
        } else {
          // keep it quiet in UI
          console.warn("Failed to load mechanics:", json.error);
        }
      } catch (e) {
        console.warn("Failed to load mechanics:", e);
      }
    })();
  }, [supabase]);

  const canAssign = currentRole ? ASSIGN_ROLES.has(currentRole) : false;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,phone,email),
        vehicles:vehicles(year,make,model,license_plate)
      `
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status === "") {
      query = query.in("status", NORMAL_FLOW_STATUSES as unknown as string[]);
    } else {
      query = query.eq("status", status);
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
  }, [q, status, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("work_orders:list")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        setTimeout(() => void load(), 60);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase, load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this work order? This cannot be undone.")) return;

      const prev = rows;
      setRows((r) => r.filter((x) => x.id !== id));

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
    },
    [rows, supabase],
  );

  const handleAssignAll = useCallback(
    async (woId: string) => {
      if (!selectedTechId) {
        alert("Choose a mechanic first.");
        return;
      }

      try {
        const res = await fetch("/api/work-orders/assign-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            work_order_id: woId,
            tech_id: selectedTechId,
            only_unassigned: true,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          alert(json.error || "Failed to assign.");
          return;
        }
        setAssigningFor(null);
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to assign.";
        alert(msg);
      }
    },
    [selectedTechId, load],
  );

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-orange-400">Work Orders</h1>
        <Link
          href="/work-orders/create"
          className="rounded bg-orange-500 px-3 py-1.5 font-semibold text-black hover:bg-orange-600"
        >
          + New
        </Link>
        <div className="ml-auto flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Search id, custom id, name, plate, YMM…"
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            aria-label="Filter by status"
          >
            <option value="">All (approved / normal flow)</option>
            <option value="awaiting_approval">Awaiting approval</option>
            <option value="awaiting">Awaiting</option>
            <option value="queued">Queued</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="planned">Planned</option>
            <option value="new">New</option>
            <option value="completed">Completed</option>
            <option value="ready_to_invoice">Ready to invoice</option>
            <option value="invoiced">Invoiced</option>
          </select>
          <button
            onClick={() => void load()}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="mb-3 rounded bg-red-500/10 p-2 text-sm text-red-300">{err}</div>}

      {loading ? (
        <div className="text-neutral-300">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-neutral-400">No work orders found.</div>
      ) : (
        <div className="divide-y divide-neutral-800 rounded border border-neutral-800 bg-neutral-900">
          {rows.map((r) => {
            const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;
            const isAssigning = assigningFor === r.id;

            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="w-28 text-xs text-neutral-400">
                  {r.created_at ? format(new Date(r.created_at), "PP") : "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={href}
                      className="font-medium underline decoration-neutral-600 underline-offset-2 hover:decoration-orange-500"
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
                  <div className="truncate text-sm text-neutral-300">
                    {r.customers
                      ? `${[r.customers.first_name ?? "", r.customers.last_name ?? ""]
                          .filter(Boolean)
                          .join(" ")}`
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
                  <Link
                    href={href}
                    className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => void handleDelete(r.id)}
                    className="rounded border border-red-600/60 px-2 py-1 text-sm text-red-300 hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                  {canAssign && (
                    <>
                      {!isAssigning ? (
                        <button
                          onClick={() => {
                            setAssigningFor(r.id);
                          }}
                          className="rounded border border-sky-600/60 px-2 py-1 text-sm text-sky-200 hover:bg-sky-900/10"
                        >
                          Assign
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select
                            value={selectedTechId}
                            onChange={(e) => setSelectedTechId(e.target.value)}
                            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white"
                          >
                            <option value="">Pick mechanic…</option>
                            {techs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.full_name ?? "(no name)"} {t.role ? `(${t.role})` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => void handleAssignAll(r.id)}
                            className="rounded bg-orange-500 px-2 py-1 text-xs font-semibold text-black hover:bg-orange-400"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => setAssigningFor(null)}
                            className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </>
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