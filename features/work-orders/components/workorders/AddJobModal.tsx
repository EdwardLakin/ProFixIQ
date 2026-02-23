// features/work-orders/components/AddJobModal.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { PostgrestError } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineInsert = DB["public"]["Tables"]["work_order_lines"]["Insert"];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId: string | null;
  techId: string;
  onJobAdded?: () => void;
  shopId?: string | null;
};

type Urgency = "low" | "medium" | "high";

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  const pe = e as Partial<PostgrestError> | null;
  if (pe && typeof pe.message === "string") return pe.message;
  return "Unknown error";
}

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

type PartItemRow = {
  id: string;
  description: string;
  qty: string; // keep as string for controlled input, convert on submit
};

type PartRequestCreateBodyItem = {
  description: string;
  qty: number;
};

type PartRequestCreateBody = {
  workOrderId: string;
  jobId?: string | null;
  items: PartRequestCreateBodyItem[];
  notes?: string | null;
};

function parsePartsText(raw: string): PartRequestCreateBodyItem[] {
  const s = safeTrim(raw);
  if (!s) return [];

  const tokens = s
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const items: PartRequestCreateBodyItem[] = [];

  for (const t of tokens) {
    // "2x oil filter", "2 x oil filter", "2 oil filter"
    const m = /^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.*)$/i.exec(t);
    if (m) {
      const qtyNum = Number(m[1]);
      const desc = (m[2] ?? "").trim();
      const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1;
      if (desc) items.push({ description: desc, qty });
      continue;
    }
    items.push({ description: t, qty: 1 });
  }

  return items;
}

function normalizeQty(q: string): number {
  const n = Number(q);
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 1;
  return n;
}

export default function AddJobModal(props: Props) {
  const { isOpen, onClose, workOrderId, vehicleId, techId, onJobAdded, shopId } =
    props;

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const lastSetShopId = useRef<string | null>(null);

  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [labor, setLabor] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");

  // structured parts list
  const [partsRows, setPartsRows] = useState<PartItemRow[]>([]);
  const [partsPaste, setPartsPaste] = useState("");

  const [createPartsRequest, setCreatePartsRequest] = useState(false);
  const [holdForParts, setHoldForParts] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validItemsCount = useMemo(() => {
    return partsRows.filter((r) => safeTrim(r.description).length > 0).length;
  }, [partsRows]);

  // Auto-enable request if user has at least one item
  useEffect(() => {
    if (validItemsCount > 0) setCreatePartsRequest(true);
    if (validItemsCount === 0) setCreatePartsRequest(false);
  }, [validItemsCount]);

  async function ensureShopContext(id: string | null) {
    if (!id) return;
    if (lastSetShopId.current === id) return;

    const { error } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: id,
    });
    if (error) throw error;

    lastSetShopId.current = id;
  }

  function addRow(seed?: Partial<PartItemRow>) {
    setPartsRows((prev) => [
      ...prev,
      {
        id: uuidv4(),
        description: seed?.description ?? "",
        qty: seed?.qty ?? "1",
      },
    ]);
  }

  function removeRow(id: string) {
    setPartsRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(id: string, patch: Partial<PartItemRow>) {
    setPartsRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function createRequest(args: PartRequestCreateBody): Promise<string> {
    const res = await fetch("/api/parts/requests/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    const json = (await res.json().catch(() => null)) as
      | { requestId?: string; error?: string }
      | null;

    if (!res.ok || !json?.requestId) {
      const msg =
        json?.error ??
        `Failed to create parts request (status ${res.status}).`;
      throw new Error(msg);
    }

    return json.requestId;
  }

  function applyPasteToRows() {
    const parsed = parsePartsText(partsPaste);
    if (parsed.length === 0) {
      setErr("Nothing to import. Paste something like: 2x oil filter, serpentine belt");
      return;
    }

    setErr(null);
    setPartsRows((prev) => {
      const next = [...prev];
      for (const p of parsed) {
        next.push({
          id: uuidv4(),
          description: p.description,
          qty: String(p.qty),
        });
      }
      return next;
    });
    setPartsPaste("");
  }

  const handleSubmit = async () => {
    if (!jobName.trim()) {
      setErr("Job name is required.");
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      // resolve shop_id
      let useShopId = shopId ?? null;

      if (!useShopId) {
        const { data: wo, error: woErr } = await supabase
          .from("work_orders")
          .select("shop_id")
          .eq("id", workOrderId)
          .maybeSingle();

        if (woErr) throw woErr;

        useShopId =
          (wo as Pick<WorkOrderRow, "shop_id"> | null)?.shop_id ?? null;
      }

      if (!useShopId) {
        throw new Error("Couldn’t resolve shop for this work order");
      }

      await ensureShopContext(useShopId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const laborNum =
        labor.trim().length > 0 && !Number.isNaN(Number(labor))
          ? Number(labor)
          : null;

      const items: PartRequestCreateBodyItem[] = partsRows
        .map((r) => ({
          description: safeTrim(r.description),
          qty: normalizeQty(r.qty),
        }))
        .filter((it) => it.description.length > 0);

      const wantsPartsRequest = createPartsRequest && items.length > 0;

      const newLineId = uuidv4();

      const initialStatus: WorkOrderLineInsert["status"] = wantsPartsRequest
        ? (holdForParts ? "on_hold" : "awaiting_approval")
        : "awaiting_approval";

      const payload: WorkOrderLineInsert = {
        id: newLineId,
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        cause: null,
        correction: notes.trim() || null,
        labor_time: laborNum,

        // keep legacy text field populated too (nice for quick scanning)
        parts: items.length > 0 ? items.map((i) => `${i.qty}x ${i.description}`).join(", ") : null,

        status: initialStatus,
        job_type: "repair",
        shop_id: useShopId,

        ...(user?.id ? { user_id: user.id } : {}),
        ...(techId && techId !== "system" ? { assigned_to: techId } : {}),
        ...(urgency ? { urgency } : {}),
      };

      // 1) Create job line
      const { error: insErr } = await supabase
        .from("work_order_lines")
        .insert(payload);

      if (insErr) {
        const msg = insErr.message || "Failed to add job.";
        if (/row-level security/i.test(msg)) {
          setErr(
            "Access denied (RLS). Check that your session is scoped to this shop.",
          );
          lastSetShopId.current = null;
        } else if (/status.*check/i.test(msg)) {
          setErr("This status isn’t allowed by the database.");
        } else if (/job_type.*check/i.test(msg)) {
          setErr("This job type isn’t allowed by the database.");
        } else {
          setErr(msg);
        }
        return;
      }

      // 2) Create parts request (optional)
      if (wantsPartsRequest) {
        const requestNotes = safeTrim(notes) || null;

        await createRequest({
          workOrderId,
          jobId: newLineId,
          items,
          notes: requestNotes,
        });
      }

      onJobAdded?.();
      onClose();

      setJobName("");
      setNotes("");
      setLabor("");
      setUrgency("medium");
      setPartsRows([]);
      setPartsPaste("");
      setErr(null);
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Failed to add job.");
      lastSetShopId.current = null;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Job Line"
      onSubmit={handleSubmit}
      submitText={submitting ? "Adding…" : "Add Job"}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Job name
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="e.g. Replace serpentine belt"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Notes / correction
          </label>
          <textarea
            rows={3}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="Optional notes, concerns, or correction details…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Labor hours
            </label>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              placeholder="e.g. 1.5"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Urgency
            </label>
            <select
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as Urgency)}
            >
              <option value="low">Low urgency</option>
              <option value="medium">Medium urgency</option>
              <option value="high">High urgency</option>
            </select>
          </div>
        </div>

        {/* Structured parts list */}
        <div className="rounded-md border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
                Parts required
              </div>
              <div className="text-xs text-neutral-500">
                Add parts as rows (Qty + Description).
              </div>
            </div>

            <button
              type="button"
              onClick={() => addRow()}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/55"
            >
              + Add part
            </button>
          </div>

          {partsRows.length === 0 ? (
            <div className="text-sm text-neutral-400">
              No parts added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {partsRows.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
                    value={r.qty}
                    onChange={(e) => updateRow(r.id, { qty: e.target.value })}
                    placeholder="Qty"
                  />
                  <input
                    className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
                    value={r.description}
                    onChange={(e) => updateRow(r.id, { description: e.target.value })}
                    placeholder="Part description (e.g. Tie rod end RH)"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-xs font-semibold text-neutral-200 hover:bg-black/55"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Quick paste importer */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Quick paste (optional)
            </label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              placeholder="Paste: 2x oil filter, serpentine belt"
              value={partsPaste}
              onChange={(e) => setPartsPaste(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={applyPasteToRows}
                className="rounded-md border border-[var(--accent-copper-light)]/40 bg-[var(--accent-copper-light)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-light)]/15"
              >
                Import to parts list
              </button>
              <button
                type="button"
                onClick={() => setPartsPaste("")}
                className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-black/55"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* parts request options */}
        <div className="rounded-md border border-white/10 bg-black/30 px-3 py-3">
          <div className="flex items-start gap-2">
            <input
              id="pr-create"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent-copper-light)]"
              checked={createPartsRequest}
              onChange={(e) => setCreatePartsRequest(e.target.checked)}
              disabled={validItemsCount === 0}
            />
            <label htmlFor="pr-create" className="min-w-0">
              <div className="text-sm font-semibold text-white">
                Create parts request
              </div>
              <div className="text-xs text-neutral-400">
                Creates a request (and items) linked to this new job line.
              </div>
            </label>
          </div>

          <div className="mt-3 flex items-start gap-2">
            <input
              id="pr-hold"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--accent-copper-light)]"
              checked={holdForParts}
              onChange={(e) => setHoldForParts(e.target.checked)}
              disabled={!createPartsRequest || validItemsCount === 0}
            />
            <label htmlFor="pr-hold" className="min-w-0">
              <div className="text-sm font-semibold text-white">
                Put job on hold for parts
              </div>
              <div className="text-xs text-neutral-400">
                Sets the new line status to <span className="text-neutral-200">on_hold</span>{" "}
                when the parts request is created.
              </div>
            </label>
          </div>

          {validItemsCount === 0 ? (
            <div className="mt-2 text-xs text-neutral-500">
              Add at least one part to enable parts request.
            </div>
          ) : null}
        </div>

        {err && (
          <div className="rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        )}
      </div>
    </ModalShell>
  );
}