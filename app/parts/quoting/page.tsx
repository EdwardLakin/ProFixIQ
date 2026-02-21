// app/parts/quoting/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import dynamic from "next/dynamic";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";

const PartsDrawer = dynamic(() => import("@/features/parts/components/PartsDrawer"), {
  ssr: false,
});

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type QueueRow = WorkOrderLine & {
  work_order: WorkOrder | null;
  vehicle: Vehicle | null;
  customer: Customer | null;
};

type MenuUpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

type ApplyAiUnmatched = { name: string; qty: number };
type ApplyAiResponse = {
  ok?: boolean;
  labor_applied?: boolean;
  unmatched?: ApplyAiUnmatched[];
  error?: string;
};

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide";
const BADGE: Record<string, string> = {
  awaiting: "bg-sky-950/30 border-sky-500/30 text-sky-200",
  awaiting_approval: "bg-blue-950/30 border-blue-500/30 text-blue-200",
  queued: "bg-indigo-950/30 border-indigo-500/30 text-indigo-200",
  in_progress: "bg-amber-950/30 border-amber-500/30 text-amber-200",
  on_hold: "bg-orange-950/30 border-orange-500/30 text-orange-200",
  completed: "bg-emerald-950/25 border-emerald-500/30 text-emerald-200",
  quoted: "bg-teal-950/25 border-teal-500/30 text-teal-200",
};
const chip = (s: string | null | undefined): string => {
  const k = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
  return `${BASE_BADGE} ${BADGE[k] ?? BADGE.awaiting}`;
};

// ---- Theme (glass + burnt copper / metallic; no orange-400/500) ----
const COPPER_BORDER = "border-[#8b5a2b]/60";
const COPPER_TEXT = "text-[#c88a4d]";
const COPPER_HOVER_BG = "hover:bg-[#8b5a2b]/10";
const COPPER_FOCUS_RING = "focus:ring-2 focus:ring-[#8b5a2b]/35";

const PAGE = "p-4 sm:p-6 text-white space-y-4";
const CARD =
  "rounded-xl border border-white/10 bg-neutral-950/35 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
const CARD_PAD = `${CARD} p-4`;
const HEADER_BAR = "flex flex-col gap-3 md:flex-row md:items-center md:justify-between";

const BTN_BASE =
  "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60";
const BTN_GHOST = `${BTN_BASE} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
const BTN_COPPER = `${BTN_BASE} ${COPPER_BORDER} ${COPPER_TEXT} bg-neutral-950/20 ${COPPER_HOVER_BG}`;
const BTN_GO = `${BTN_BASE} border-emerald-500/30 bg-emerald-950/25 text-emerald-200 hover:bg-emerald-900/25`;
const BTN_AI = `${BTN_BASE} border-sky-500/30 bg-sky-950/25 text-sky-200 hover:bg-sky-900/25`;

const SMALL = "text-xs text-neutral-400";
const INPUT = `w-full rounded-lg border border-white/10 bg-neutral-950/40 px-4 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none ${COPPER_FOCUS_RING}`;

async function safeText(res: Response): Promise<string> {
  return res.text().catch(() => "");
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default function QuotingQueuePage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const bulkActive = bulkQueue.length > 0;

  const [search, setSearch] = useState<string>("");
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const wo = r.work_order?.custom_id ?? r.work_order?.id ?? "";
      const title = r.description ?? r.complaint ?? "";
      const notes = r.notes ?? "";
      const veh = r.vehicle
        ? `${r.vehicle.year ?? ""} ${r.vehicle.make ?? ""} ${r.vehicle.model ?? ""}`.trim()
        : "";
      const cust = r.customer
        ? `${r.customer.first_name ?? ""} ${r.customer.last_name ?? ""}`.trim()
        : "";
      const blob = `${wo} ${title} ${notes} ${veh} ${cust}`.toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const { data: lines, error: lerr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("approval_state", "pending")
        .order("created_at", { ascending: true });

      if (lerr) throw lerr;

      const wol = (lines ?? []) as WorkOrderLine[];
      if (wol.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const woIds = [...new Set(wol.map((l) => l.work_order_id).filter(Boolean) as string[])];

      const { data: woRows, error: woErr } = await supabase
        .from("work_orders")
        .select("*")
        .in("id", woIds);

      if (woErr) throw woErr;

      const woById = new Map<string, WorkOrder>();
      (woRows ?? []).forEach((w) => woById.set((w as WorkOrder).id, w as WorkOrder));

      const vehIds = [
        ...new Set((woRows ?? []).map((w) => (w as WorkOrder).vehicle_id).filter(Boolean) as string[]),
      ];
      const custIds = [
        ...new Set((woRows ?? []).map((w) => (w as WorkOrder).customer_id).filter(Boolean) as string[]),
      ];

      const [vehRes, custRes] = await Promise.all([
        vehIds.length
          ? supabase.from("vehicles").select("*").in("id", vehIds)
          : Promise.resolve({ data: [] } as const),
        custIds.length
          ? supabase.from("customers").select("*").in("id", custIds)
          : Promise.resolve({ data: [] } as const),
      ]);

      const vById = new Map<string, Vehicle>();
      (vehRes.data ?? []).forEach((v) => vById.set((v as Vehicle).id, v as Vehicle));

      const cById = new Map<string, Customer>();
      (custRes.data ?? []).forEach((c) => cById.set((c as Customer).id, c as Customer));

      const out: QueueRow[] = wol.map((l) => {
        const wo = l.work_order_id ? woById.get(l.work_order_id) ?? null : null;
        const vehicle = wo?.vehicle_id ? vById.get(wo.vehicle_id) ?? null : null;
        const customer = wo?.customer_id ? cById.get(wo.customer_id) ?? null : null;
        return { ...l, work_order: wo, vehicle, customer };
      });

      setRows(out);

      if (selectedId && !out.some((r) => r.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load quoting queue.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedId]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const ch = supabase
      .channel("quote-queue")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: "approval_state=eq.pending",
        },
        () => void fetchQueue(),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [supabase, fetchQueue]);

  const startBulk = useCallback(() => {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    setBulkQueue(ids);
    setSelectedId(ids[0] ?? null);
    toast.message(`Quoting ${ids.length} pending line(s)…`);
  }, [rows]);

  useEffect(() => {
    if (!selectedId) return;

    const evt = `parts-drawer:closed:${selectedId}`;
    const handler = () => {
      if (bulkActive) {
        const [, ...rest] = bulkQueue;
        setBulkQueue(rest);
        setSelectedId(rest[0] ?? null);
        if (rest.length === 0) void fetchQueue();
      } else {
        setSelectedId(null);
        void fetchQueue();
      }
    };

    window.addEventListener(evt, handler as EventListener);
    return () => window.removeEventListener(evt, handler as EventListener);
  }, [selectedId, bulkActive, bulkQueue, fetchQueue]);

  // ---- AI Apply: suggest + server inserts allocations + labor
  const aiApply = useCallback(
    async (row: QueueRow) => {
      if (!row.id) return;
      toast.loading("AI preparing parts & labor…", { id: `ai-${row.id}` });

      try {
        const suggestion = await requestQuoteSuggestion({
          item: row.description ?? "Job",
          notes: row.notes ?? "",
          section: "Quote Queue",
          status: "recommend",
          vehicle: row.vehicle ?? undefined,
        });

        if (!suggestion) {
          toast.error("AI returned no suggestion.", { id: `ai-${row.id}` });
          return;
        }

        const r = await fetch("/api/quotes/apply-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: row.id, suggestion }),
        });

        const raw = await safeText(r);
        const j = tryParseJson<ApplyAiResponse>(raw);

        if (!r.ok || !j?.ok) {
          throw new Error(j?.error || raw || `HTTP ${r.status}`);
        }

        if (j.unmatched && j.unmatched.length) {
          const list = j.unmatched
            .map((u: ApplyAiUnmatched) => `${u.qty}× ${u.name}`)
            .join(", ");
          toast.message(`Some parts need manual matching: ${list}`, { id: `ai-${row.id}` });
        } else {
          toast.success("AI parts & labor applied", { id: `ai-${row.id}` });
        }

        await fetchQueue();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "AI apply failed", { id: `ai-${row.id}` });
      }
    },
    [fetchQueue],
  );

  // ---- Mark as quoted (still pending approval) + grow Saved Menu
  const markQuoted = useCallback(
    async (row: QueueRow) => {
      if (!row.id) return;
      toast.loading("Marking as quoted…", { id: `quoted-${row.id}` });

      try {
        const r = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: row.id }),
        });

        const raw = await safeText(r);
        const body = tryParseJson<MenuUpsertResponse>(raw);

        if (!r.ok || !body?.ok) {
          const reason = body?.detail || body?.error || raw || `HTTP ${r.status}`;
          toast.warning(`Quoted, but couldn’t save to menu items. ${reason}`, { id: `quoted-${row.id}` });
          return;
        }

        const nextNotes = `${row.notes ?? ""}`.includes("[quoted]")
          ? row.notes
          : [row.notes ?? "", "[quoted]"].filter(Boolean).join(" ").trim();

        const { error: ue } = await supabase
          .from("work_order_lines")
          .update(
            {
              status: "quoted",
              notes: nextNotes,
            } as DB["public"]["Tables"]["work_order_lines"]["Update"],
          )
          .eq("id", row.id);

        if (ue) {
          toast.success("Saved Menu updated, but line status could not be set to quoted.", {
            id: `quoted-${row.id}`,
          });
        } else {
          toast.success("Marked as quoted (awaiting approval). Saved Menu updated.", { id: `quoted-${row.id}` });
        }

        await fetchQueue();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to mark as quoted", { id: `quoted-${row.id}` });
      }
    },
    [supabase, fetchQueue],
  );

  return (
    <div className={PAGE}>
      <VoiceContextSetter currentView="parts_quoting" />

      <div className={HEADER_BAR}>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Parts</div>
          <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
            Quoting Queue
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Pending approval lines that need quoting. Use AI Apply or open the Parts Drawer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/parts/inventory" className={BTN_COPPER}>
            Inventory →
          </Link>
          <button type="button" className={BTN_GHOST} onClick={() => void fetchQueue()}>
            Refresh
          </button>
          <button
            type="button"
            className={BTN_COPPER}
            onClick={startBulk}
            disabled={rows.length === 0}
            title="Walk through each pending line with the Parts Drawer"
          >
            Quote all pending ({rows.length})
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/35 p-3 text-red-200">{err}</div>
      )}

      {/* search */}
      <div className={CARD_PAD}>
        <div className="grid gap-3 md:grid-cols-12 md:items-center">
          <div className="md:col-span-8">
            <div className={SMALL}>Search by WO, job, notes, vehicle, customer</div>
            <input
              className={INPUT}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
          </div>
          <div className="md:col-span-4">
            <div className={SMALL}>Bulk mode</div>
            <div className="rounded-lg border border-white/10 bg-neutral-950/20 px-3 py-2 text-sm text-neutral-200">
              {bulkActive ? (
                <>
                  Active · Remaining <span className={COPPER_TEXT}>{bulkQueue.length}</span>
                </>
              ) : (
                "Inactive"
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[460px_1fr]">
        {/* LEFT: queue */}
        <div className={CARD}>
          <div className="border-b border-white/10 px-4 py-3 text-sm text-neutral-300">Pending approval lines</div>

          {loading ? (
            <div className="p-4 text-neutral-400">Loading…</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-4 text-neutral-400">Nothing awaiting quoting.</div>
          ) : (
            <ul className="divide-y divide-white/10">
              {filteredRows.map((r) => {
                const active = selectedId === r.id;
                const woLabel = r.work_order?.custom_id || r.work_order?.id?.slice(0, 8) || "—";
                const title = r.description || r.complaint || "Untitled job";
                const veh = r.vehicle
                  ? `${r.vehicle.year ?? ""} ${r.vehicle.make ?? ""} ${r.vehicle.model ?? ""}`.trim()
                  : "No vehicle";
                const when = r.created_at ? format(new Date(r.created_at), "PPp") : "—";

                return (
                  <li key={r.id} className={["px-4 py-3", active ? "bg-white/5" : ""].join(" ")}>
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" className="min-w-0 text-left" onClick={() => setSelectedId(r.id)}>
                        <div className="truncate font-semibold text-white">{title}</div>
                        <div className="mt-1 text-xs text-neutral-400">
                          WO: {woLabel} <span className="mx-2 text-neutral-600">·</span>
                          {veh} <span className="mx-2 text-neutral-600">·</span>
                          {when}
                        </div>
                        {r.notes ? (
                          <div className="mt-1 truncate text-xs text-neutral-400">Notes: {r.notes}</div>
                        ) : null}
                      </button>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className={chip(r.status)}>{(r.status ?? "awaiting").replaceAll("_", " ")}</span>

                        <div className="flex items-center gap-2">
                          <button type="button" className={BTN_AI} onClick={() => void aiApply(r)}>
                            AI Apply
                          </button>

                          <button type="button" className={BTN_GHOST} onClick={() => setSelectedId(r.id)}>
                            Quote
                          </button>

                          <button type="button" className={BTN_GO} onClick={() => void markQuoted(r)}>
                            Mark Quoted
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT: details */}
        <div className={CARD_PAD}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Details</h2>
            {selected?.work_order?.id ? (
              <Link href={`/work-orders/${selected.work_order.id}`} className={BTN_COPPER}>
                Open Work Order →
              </Link>
            ) : null}
          </div>

          {selected ? (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className={SMALL}>Work Order</div>
                <div className="font-semibold text-white">
                  {selected.work_order?.custom_id || selected.work_order?.id?.slice(0, 8) || "—"}
                </div>
              </div>

              <div>
                <div className={SMALL}>Vehicle</div>
                <div className="font-semibold text-white">
                  {selected.vehicle
                    ? (`${selected.vehicle.year ?? ""} ${selected.vehicle.make ?? ""} ${selected.vehicle.model ?? ""}`.trim() || "—")
                    : "—"}
                </div>
              </div>

              <div>
                <div className={SMALL}>Customer</div>
                <div className="font-semibold text-white">
                  {selected.customer
                    ? ([selected.customer.first_name ?? "", selected.customer.last_name ?? ""].filter(Boolean).join(" ") || "—")
                    : "—"}
                </div>
              </div>

              <div>
                <div className={SMALL}>Description</div>
                <div className="font-semibold text-white">{selected.description ?? "—"}</div>
              </div>

              <div>
                <div className={SMALL}>Notes</div>
                <div className="whitespace-pre-wrap font-semibold text-white">{selected.notes ?? "—"}</div>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-neutral-400">Select a line on the left to see details.</div>
          )}
        </div>
      </div>

      {/* Parts drawer */}
      {selected && selected.work_order?.id && (
        <PartsDrawer
          open
          workOrderId={selected.work_order.id}
          workOrderLineId={selected.id}
          vehicleSummary={
            selected.vehicle
              ? {
                  year: (selected.vehicle.year as string | number | null)?.toString() ?? null,
                  make: selected.vehicle.make ?? null,
                  model: selected.vehicle.model ?? null,
                }
              : null
          }
          jobDescription={selected.description ?? null}
          jobNotes={selected.notes ?? null}
          closeEventName={`parts-drawer:closed:${selected.id}`}
        />
      )}

      
    </div>
  );
}