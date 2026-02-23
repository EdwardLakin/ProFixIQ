// features/work-orders/components/AddJobModal.tsx (FULL FILE REPLACEMENT)
"use client";

import { useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { PostgrestError } from "@supabase/supabase-js";
import { toast } from "sonner";

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

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type PartRow = {
  id: string;
  name: string;
  qty: string; // keep as string for controlled input
};

type ApplyAiSuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate: number;
  summary: string;
  confidence: "low" | "medium" | "high";
  price?: number;
  notes?: string;
  title?: string;
};

type ApplyAiBody = {
  workOrderLineId: string;
  suggestion: ApplyAiSuggestion;
};

type ApplyAiResponse =
  | { ok: true; unmatched: { name: string; qty: number }[] }
  | { error: string; detail?: string; code?: string };

type PartRequestCreateBody = {
  workOrderId: string;
  jobId?: string | null;
  items: { description: string; qty: number }[];
  notes?: string | null;
};

function normalizeQty(q: string): number {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function parsePartsPaste(raw: string): { name: string; qty: number }[] {
  const s = safeTrim(raw);
  if (!s) return [];
  const tokens = s
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: { name: string; qty: number }[] = [];
  for (const t of tokens) {
    // supports: "2x oil filter", "2 x oil filter", "2 oil filter"
    const m = /^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.*)$/i.exec(t);
    if (m) {
      const qtyNum = Number(m[1]);
      const name = (m[2] ?? "").trim();
      if (!name) continue;
      out.push({ name, qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1 });
    } else {
      out.push({ name: t, qty: 1 });
    }
  }
  return out;
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

  const [partsRows, setPartsRows] = useState<PartRow[]>([]);
  const [partsPaste, setPartsPaste] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ensureShopContext(id: string | null) {
    if (!id) return;
    if (lastSetShopId.current === id) return;

    const { error } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: id,
    });
    if (error) throw error;

    lastSetShopId.current = id;
  }

  function addPartRow(seed?: Partial<PartRow>) {
    setPartsRows((prev) => [
      ...prev,
      { id: uuidv4(), name: seed?.name ?? "", qty: seed?.qty ?? "1" },
    ]);
  }

  function removePartRow(id: string) {
    setPartsRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updatePartRow(id: string, patch: Partial<PartRow>) {
    setPartsRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function importPaste() {
    const parsed = parsePartsPaste(partsPaste);
    if (parsed.length === 0) {
      setErr("Nothing to import. Paste like: 2x oil filter, serpentine belt");
      return;
    }
    setErr(null);
    setPartsRows((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        id: uuidv4(),
        name: p.name,
        qty: String(p.qty),
      })),
    ]);
    setPartsPaste("");
  }

  function resetForm() {
    setJobName("");
    setNotes("");
    setLabor("");
    setUrgency("medium");
    setPartsRows([]);
    setPartsPaste("");
    setErr(null);
  }

  async function callApplyAi(workOrderLineId: string, suggestion: ApplyAiSuggestion) {
    const res = await fetch("/api/quotes/apply-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workOrderLineId, suggestion } satisfies ApplyAiBody),
    });

    const json = (await res.json().catch(() => null)) as ApplyAiResponse | null;

    if (!res.ok || !json || "error" in json) {
      const msg =
        (json && "error" in json ? json.error : null) ??
        `Failed applying parts (status ${res.status}).`;
      const detail = json && "error" in json ? json.detail : undefined;
      throw new Error(detail ? `${msg}: ${detail}` : msg);
    }

    return json.unmatched ?? [];
  }

  async function createPartsRequest(body: PartRequestCreateBody): Promise<string> {
    const res = await fetch("/api/parts/requests/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

      if (!useShopId) throw new Error("Couldn’t resolve shop for this work order");

      await ensureShopContext(useShopId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const laborNum = asNumber(labor);
      const laborHours = laborNum ?? 0;

      const parts = partsRows
        .map((r) => ({
          name: safeTrim(r.name),
          qty: normalizeQty(r.qty),
        }))
        .filter((p) => p.name.length > 0);

      const hasParts = parts.length > 0;

      // If parts were entered, we default the line to on_hold (your "waiting for parts")
      const initialStatus: WorkOrderLineInsert["status"] = hasParts
        ? "on_hold"
        : "awaiting_approval";

      const newLineId = uuidv4();

      const payload: WorkOrderLineInsert = {
        id: newLineId,
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        cause: null,
        correction: notes.trim() || null,
        labor_time: laborHours > 0 ? laborHours : null,

        // keep legacy text column filled for now
        parts: hasParts ? parts.map((p) => `${p.qty}x ${p.name}`).join(", ") : null,

        status: initialStatus,
        job_type: "repair",
        shop_id: useShopId,

        ...(user?.id ? { user_id: user.id } : {}),
        ...(techId && techId !== "system" ? { assigned_to: techId } : {}),
        ...(urgency ? { urgency } : {}),
      };

      // 1) Create the line
      const { error: insErr } = await supabase
        .from("work_order_lines")
        .insert(payload);

      if (insErr) {
        const msg = insErr.message || "Failed to add job.";
        if (/row-level security/i.test(msg)) {
          setErr("Access denied (RLS). Check that your session is scoped to this shop.");
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

      // 2) Auto-apply parts allocations via apply-ai (if parts were entered)
      let unmatched: { name: string; qty: number }[] = [];
      if (hasParts) {
        const suggestion: ApplyAiSuggestion = {
          parts: parts.map((p) => ({ name: p.name, qty: p.qty })),
          laborHours,
          laborRate: 0,
          summary: safeTrim(notes) || jobName.trim(),
          confidence: "high",
          title: jobName.trim(),
          notes: safeTrim(notes) || undefined,
        };

        try {
          unmatched = await callApplyAi(newLineId, suggestion);
        } catch (e: unknown) {
          // If apply-ai fails, we still keep the line created.
          // We can optionally create a parts request from the entered parts as fallback,
          // but that may be noisy if the failure is config-related.
          toast.error(e instanceof Error ? e.message : "Failed allocating parts.");
        }
      }

      // 3) If unmatched parts exist, auto-create a parts request for just the unmatched
      if (unmatched.length > 0) {
        try {
          await createPartsRequest({
            workOrderId,
            jobId: newLineId,
            items: unmatched.map((u) => ({
              description: u.name,
              qty: u.qty,
            })),
            notes: safeTrim(notes) || null,
          });
          toast.message(
            `Parts request created for ${unmatched.length} unmatched item(s).`,
          );
        } catch (e: unknown) {
          toast.error(
            e instanceof Error ? e.message : "Failed creating parts request.",
          );
        }
      }

      // Success toast
      if (hasParts) {
        if (unmatched.length > 0) {
          toast.success(
            `Job added. Allocated what we could; ${unmatched.length} item(s) went to parts request.`,
          );
        } else {
          toast.success("Job added + parts allocated.");
        }
      } else {
        toast.success("Job added.");
      }

      onJobAdded?.();
      onClose();
      resetForm();
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
      onClose={() => {
        onClose();
        setErr(null);
      }}
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
            placeholder="e.g. Replace tie rod end RH"
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

        {/* Parts (auto allocation + auto parts request for unmatched) */}
        <div className="rounded-md border border-white/10 bg-black/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
                Parts
              </div>
              <div className="text-xs text-neutral-500">
                If you add parts, we’ll auto-allocate matches and auto-create a parts request for unmatched items.
              </div>
            </div>

            <button
              type="button"
              onClick={() => addPartRow()}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/55"
            >
              + Add part
            </button>
          </div>

          {partsRows.length === 0 ? (
            <div className="text-sm text-neutral-400">No parts added.</div>
          ) : (
            <div className="space-y-2">
              {partsRows.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    className="w-20 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
                    value={r.qty}
                    onChange={(e) => updatePartRow(r.id, { qty: e.target.value })}
                    placeholder="Qty"
                  />
                  <input
                    className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
                    value={r.name}
                    onChange={(e) => updatePartRow(r.id, { name: e.target.value })}
                    placeholder="Part name (matches inventory parts by name)"
                  />
                  <button
                    type="button"
                    onClick={() => removePartRow(r.id)}
                    className="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-xs font-semibold text-neutral-200 hover:bg-black/55"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-white/10 pt-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Quick paste
            </label>
            <textarea
              rows={2}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              placeholder="Paste: 2x tie rod end RH, cotter pin"
              value={partsPaste}
              onChange={(e) => setPartsPaste(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={importPaste}
                className="rounded-md border border-[var(--accent-copper-light)]/40 bg-[var(--accent-copper-light)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-light)]/15"
              >
                Import
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

        {err && (
          <div className="rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        )}
      </div>
    </ModalShell>
  );
}