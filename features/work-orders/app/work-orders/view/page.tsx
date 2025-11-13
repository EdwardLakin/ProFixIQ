"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

/* --------------------------- Status badges --------------------------- */
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
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium tracking-[0.08em] uppercase";

const STATUS_BADGE: Record<StatusKey, string> = {
  awaiting_approval:
    "bg-blue-200/10 border-blue-400/50 text-blue-100",
  awaiting:
    "bg-sky-200/10 border-sky-400/50 text-sky-100",
  queued:
    "bg-indigo-200/10 border-indigo-400/50 text-indigo-100",
  in_progress:
    "bg-orange-200/10 border-orange-400/60 text-orange-100",
  on_hold:
    "bg-amber-200/10 border-amber-400/60 text-amber-100",
  planned:
    "bg-purple-200/10 border-purple-400/60 text-purple-100",
  new:
    "bg-neutral-800/80 border-neutral-500/80 text-neutral-100",
  completed:
    "bg-green-200/10 border-green-400/60 text-green-100",
  ready_to_invoice:
    "bg-emerald-200/10 border-emerald-400/60 text-emerald-100",
  invoiced:
    "bg-teal-200/10 border-teal-400/60 text-teal-100",
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

/* --------------------------- Dark input styles --------------------------- */
const INPUT_DARK =
  "w-full rounded-md border border-neutral-700 !bg-neutral-950 px-3 py-1.5 text-sm text-foreground placeholder:text-neutral-500 " +
  "focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-500/60 appearance-none [color-scheme:dark]";
const SELECT_DARK =
  "w-full rounded-md border border-neutral-700 !bg-neutral-950 px-3 py-1.5 text-sm text-foreground " +
  "focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-500/60 appearance-none [color-scheme:dark]";
const BUTTON_MUTED =
  "rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-900/60 active:bg-neutral-800/80 transition-colors";

export default function WorkOrdersView(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  // assigning
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [techs, setTechs] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");

  const [currentRole, setCurrentRole] = useState<string | null>(null);

  // assignments
  const [woAssignments, setWoAssignments] = useState<Record<string, string[]>>({});

  // load current user role + mechanics once
  useEffect(() => {
    (async () => {
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

      try {
        const res = await fetch("/api/assignables");
        const json = await res.json();
        if (res.ok) {
          setTechs(json.data ?? []);
        } else {
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

    // 1) get work orders
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
      setWoAssignments({});
      setLoading(false);
      return;
    }

    const workOrders = data as Row[];

    // 2) client-side filter by search
    const qlc = q.trim().toLowerCase();
    const filtered =
      qlc.length === 0
        ? workOrders
        : workOrders.filter((r) => {
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

    // 3) fetch assignments for visible rows
    const ids = filtered.map((r) => r.id);
    if (ids.length > 0) {
      const { data: assigns, error: assignsErr } = await supabase
        .from("work_order_technicians")
        .select("work_order_id, technician_id")
        .in("work_order_id", ids);

      if (!assignsErr && assigns) {
        const map: Record<string, string[]> = {};
        assigns.forEach((a) => {
          const woId = a.work_order_id as string;
          const techId = a.technician_id as string;
          if (!map[woId]) map[woId] = [];
          map[woId].push(techId);
        });
        setWoAssignments(map);
      } else {
        setWoAssignments({});
      }
    } else {
      setWoAssignments({});
    }

    setLoading(false);
  }, [q, status, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("work_orders:list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => {
          setTimeout(() => void load(), 60);
        }
      )
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

      const { error: lineErr } = await supabase
        .from("work_order_lines")
        .delete()
        .eq("work_order_id", id);
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
    [rows, supabase]
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
        toast.success("Work order assigned to mechanic.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to assign.";
        alert(msg);
      }
    },
    [selectedTechId, load]
  );

  // make a fast lookup for tech names
  const techsById = useMemo(() => {
    const m: Record<
      string,
      { id: string; full_name: string | null; role: string | null }
    > = {};
    techs.forEach((t) => {
      m[t.id] = {
        id: t.id,
        full_name: t.full_name,
        role: t.role,
      };
    });
    return m;
  }, [techs]);

  const total = rows.length;
  const activeCount = useMemo(
    () =>
      rows.filter((r) =>
        NORMAL_FLOW_STATUSES.includes(
          (r.status ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey
        )
      ).length,
    [rows]
  );
  const awaitingApprovalCount = useMemo(
    () =>
      rows.filter((r) => (r.status ?? "").toLowerCase() === "awaiting_approval").length,
    [rows]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-foreground">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Work Orders
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Live view of active jobs, their status, and technician assignments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/work-orders/create"
            className="inline-flex items-center justify-center rounded-full border border-orange-500/60 bg-orange-500 px-3.5 py-1.5 text-sm font-semibold text-black shadow-sm hover:bg-orange-400 hover:border-orange-400"
          >
            <span className="mr-1.5 text-base leading-none">+</span>
            New work order
          </Link>
        </div>
      </div>

      {/* Filters + stats strip */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs shadow-md shadow-black/40 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-[220px]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              placeholder="Search id, custom id, customer, plate, YMM…"
              className={INPUT_DARK}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={SELECT_DARK + " text-xs min-w-[200px]"}
              aria-label="Filter by status"
            >
              <option value="">Active (normal flow)</option>
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
              className={BUTTON_MUTED + " text-xs"}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[0.7rem] text-neutral-300">
          <div className="flex flex-col">
            <span className="uppercase tracking-[0.13em] text-neutral-500">
              Total
            </span>
            <span className="text-sm font-semibold text-white">{total}</span>
          </div>
          <div className="h-7 w-px bg-neutral-700/60" />
          <div className="flex flex-col">
            <span className="uppercase tracking-[0.13em] text-neutral-500">
              Active
            </span>
            <span className="text-sm font-semibold text-sky-200">
              {activeCount}
            </span>
          </div>
          <div className="h-7 w-px bg-neutral-700/60" />
          <div className="flex flex-col">
            <span className="uppercase tracking-[0.13em] text-neutral-500">
              Awaiting approval
            </span>
            <span className="text-sm font-semibold text-blue-200">
              {awaitingApprovalCount}
            </span>
          </div>
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-md border border-red-500/60 bg-red-950/40 p-2 text-xs text-red-200">
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-300">
          Loading work orders…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-6 text-sm text-neutral-400">
          No work orders match your current filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-lg shadow-black/40">
          <div className="hidden border-b border-white/5 bg-black/40 px-4 py-2 text-[0.7rem] uppercase tracking-[0.12em] text-neutral-500 sm:grid sm:grid-cols-[110px,1.6fr,1.1fr,auto] sm:gap-3">
            <div>Date</div>
            <div>Work order / customer / vehicle</div>
            <div>Assigned to</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-white/5">
            {rows.map((r) => {
              const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;
              const isAssigning = assigningFor === r.id;

              const assignedIds = woAssignments[r.id] ?? [];
              const firstTechId = assignedIds.length > 0 ? assignedIds[0] : null;
              const firstTechName =
                firstTechId && techsById[firstTechId]
                  ? techsById[firstTechId].full_name ?? "Mechanic"
                  : null;

              const customerName = r.customers
                ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ")
                : "";

              const vehicleLabel = r.vehicles
                ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${
                    r.vehicles.model ?? ""
                  }`.trim()
                : "";

              const plate = r.vehicles?.license_plate ?? "";

              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 px-3 py-3 text-sm sm:grid sm:grid-cols-[110px,1.6fr,1.1fr,auto] sm:items-center sm:gap-3"
                >
                  {/* Date */}
                  <div className="text-[0.7rem] text-neutral-400">
                    {r.created_at ? format(new Date(r.created_at), "PP") : "—"}
                  </div>

                  {/* Main: id, status, customer + vehicle */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={href}
                        className="text-sm font-semibold text-white underline decoration-neutral-500/40 underline-offset-2 hover:decoration-orange-400"
                      >
                        {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                      </Link>
                      {r.custom_id && (
                        <span className="rounded-full border border-neutral-700/80 bg-neutral-900/70 px-1.5 py-0.5 text-[0.65rem] text-neutral-400">
                          #{r.id.slice(0, 6)}
                        </span>
                      )}
                      <span className={chip(r.status)}>
                        {(r.status ?? "awaiting").replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="truncate text-[0.8rem] text-neutral-300">
                      {customerName || "No customer"}{" "}
                      <span className="mx-1 text-neutral-600">•</span>
                      {vehicleLabel || "No vehicle"}
                      {plate ? (
                        <span className="ml-1 text-neutral-400">
                          ({plate})
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Assigned to */}
                  <div className="text-[0.75rem] text-neutral-300">
                    {firstTechName ? (
                      <div className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.7rem] text-sky-100">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                        {firstTechName}
                      </div>
                    ) : (
                      <span className="text-neutral-500">Unassigned</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={href}
                      className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-100 hover:bg-neutral-900/60"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => void handleDelete(r.id)}
                      className="rounded-md border border-red-500/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-900/30"
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
                            className="rounded-md border border-sky-500/60 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-900/30"
                          >
                            Assign
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <select
                              value={selectedTechId}
                              onChange={(e) => setSelectedTechId(e.target.value)}
                              className={
                                SELECT_DARK +
                                " h-8 min-w-[150px] px-2 py-1 text-[0.7rem]"
                              }
                            >
                              <option value="">Pick mechanic…</option>
                              {techs.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.full_name ?? "(no name)"}{" "}
                                  {t.role ? `(${t.role})` : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => void handleAssignAll(r.id)}
                              className="rounded-md bg-orange-500 px-2 py-1 text-[0.7rem] font-semibold text-black hover:bg-orange-400"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => setAssigningFor(null)}
                              className="rounded-md border border-neutral-700 px-2 py-1 text-[0.7rem] text-neutral-200 hover:bg-neutral-900/60"
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
        </div>
      )}
    </div>
  );
}