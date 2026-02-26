// /features/work-orders/components/AddJobModal.tsx (FULL FILE REPLACEMENT)
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

/* ----------------------------- helpers ----------------------------- */

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

type ItemRow = { id: string; description: string; qty: string };

type PartRequestCreateBody = {
  workOrderId: string;
  jobId?: string | null;
  items: { description: string; qty: number }[];
  notes?: string | null;
};

function parsePartsPaste(raw: string): { description: string; qty: number }[] {
  const s = safeTrim(raw);
  if (!s) return [];
  const tokens = s
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: { description: string; qty: number }[] = [];
  for (const t of tokens) {
    // supports: "2x oil filter", "2 x oil filter", "2 oil filter"
    const m = /^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.*)$/i.exec(t);
    if (m) {
      const qtyNum = Number(m[1]);
      const desc = (m[2] ?? "").trim();
      if (!desc) continue;
      out.push({
        description: desc,
        qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1,
      });
    } else {
      out.push({ description: t, qty: 1 });
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

  // ✅ parts request style rows
  const [rows, setRows] = useState<ItemRow[]>([
    { id: uuidv4(), description: "", qty: "1" },
  ]);
  const [headerNotes, setHeaderNotes] = useState("");

  // quick paste
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

  const addRow = () =>
    setRows((r) => [...r, { id: uuidv4(), description: "", qty: "1" }]);

  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r));

  const setCell = (id: string, patch: Partial<ItemRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const validItems = rows
    .map((r) => {
      const description = r.description.trim();
      const n = Number.parseInt(r.qty, 10);
      const qty = Number.isFinite(n) ? n : 0;
      return { description, qty };
    })
    .filter((i) => i.description && i.qty > 0);

  function importPaste() {
    const parsed = parsePartsPaste(partsPaste);
    if (parsed.length === 0) {
      setErr("Nothing to import. Paste like: 2x oil filter, serpentine belt");
      return;
    }

    setErr(null);
    setRows((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        id: uuidv4(),
        description: p.description,
        qty: String(Math.max(1, Math.floor(p.qty))),
      })),
    ]);
    setPartsPaste("");
  }

  function resetForm() {
    setJobName("");
    setNotes("");
    setLabor("");
    setUrgency("medium");
    setHeaderNotes("");
    setRows([{ id: uuidv4(), description: "", qty: "1" }]);
    setPartsPaste("");
    setErr(null);
  }

  async function createPartsRequest(body: PartRequestCreateBody): Promise<string> {
    const res = await fetch("/api/parts/requests/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    let json: { requestId?: string; error?: string } | null = null;
    try {
      json = raw ? (JSON.parse(raw) as { requestId?: string; error?: string }) : null;
    } catch {
      /* ignore */
    }

    if (!res.ok || !json?.requestId) {
      const msg = json?.error || raw || `Request failed with status ${res.status}`;
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

        useShopId = (wo as Pick<WorkOrderRow, "shop_id"> | null)?.shop_id ?? null;
      }

      if (!useShopId) throw new Error("Couldn’t resolve shop for this work order");

      await ensureShopContext(useShopId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const laborNum = asNumber(labor);
      const laborHours = laborNum ?? 0;

      const hasParts = validItems.length > 0;

      // ✅ IMPORTANT CHANGE:
      // This modal creates advisor/tech-added jobs that require customer authorization.
      // Parts requests do NOT imply "on hold" (that's operational hold like waiting for parts delivery).
      // So always start in the approval bucket.
      const initialStatus: WorkOrderLineInsert["status"] = "awaiting_approval";

      const newLineId = uuidv4();

      const payloadBase: WorkOrderLineInsert = {
        id: newLineId,
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        cause: null,
        correction: notes.trim() || null,
        labor_time: laborHours > 0 ? laborHours : null,

        // keep legacy text column filled for now (useful for quick scanning)
        parts: hasParts
          ? validItems.map((p) => `${p.qty}x ${p.description}`).join(", ")
          : null,

        status: initialStatus,
        job_type: "repair",
        shop_id: useShopId,

        ...(user?.id ? { user_id: user.id } : {}),
        ...(techId && techId !== "system" ? { assigned_tech_id: techId } : {}),
        ...(urgency ? { urgency } : {}),
      };

      // If your DB has approval columns, we want them consistent with the UI bucket.
      // We apply them in a TS-safe way (won't break compile if not present in generated types).
      const payload = {
        ...payloadBase,
        ...( {
          approval_state: "pending",
          approval_decision: "pending",
          approval_requested_at: new Date().toISOString(),
        } as unknown as Partial<WorkOrderLineInsert>),
      } satisfies WorkOrderLineInsert;

      // 1) Create the line
      const { error: insErr } = await supabase.from("work_order_lines").insert(payload);

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

      // 2) Create parts request (keep this behavior)
      if (hasParts) {
        try {
          await createPartsRequest({
            workOrderId,
            jobId: newLineId,
            items: validItems,
            notes: safeTrim(headerNotes) || safeTrim(notes) || null,
          });

          toast.success("Job added + parts request sent.");
        } catch (e: unknown) {
          toast.error(
            `Job added, but parts request failed: ${
              e instanceof Error ? e.message : "Unknown error"
            }`,
          );
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

  if (!isOpen) return null;

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
      size="lg"
    >
      <div className="space-y-4">
        {/* Job fields */}
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

        {/* Note to parts */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Note to parts (optional)
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-black/75 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={headerNotes}
            onChange={(e) => setHeaderNotes(e.target.value)}
            placeholder="Anything they should know before filling this request…"
          />
        </div>

        {/* Items grid */}
        <div className="overflow-hidden rounded-2xl border border-[var(--metal-border-soft)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="grid grid-cols-12 bg-gradient-to-r from-slate-900/90 via-slate-950 to-black px-3 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
            <div className="col-span-8">Parts description</div>
            <div className="col-span-3 text-right">Qty</div>
            <div className="col-span-1 text-center"> </div>
          </div>

          <div className="max-h-64 overflow-auto bg-black/70">
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-12 gap-2 border-t border-white/5 px-3 py-2"
              >
                <input
                  className="col-span-8 rounded-md border border-[var(--metal-border-soft)] bg-black/80 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.description}
                  onChange={(e) => setCell(r.id, { description: e.target.value })}
                  placeholder="e.g. rear pads, serp belt…"
                />

                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="col-span-3 rounded-md border border-[var(--metal-border-soft)] bg-black/80 px-2 py-1 text-right text-sm text-neutral-100 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.qty}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^\d]/g, "");
                    setCell(r.id, { qty: next });
                  }}
                  onBlur={() => {
                    const n = Number.parseInt(r.qty, 10);
                    const normalized = Number.isFinite(n) && n > 0 ? String(n) : "1";
                    setCell(r.id, { qty: normalized });
                  }}
                  aria-label="Quantity"
                />

                <div className="col-span-1 flex items-center justify-center">
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-black/70 text-[0.7rem] text-neutral-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-black/70 disabled:hover:text-neutral-300"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length <= 1}
                    title={
                      rows.length <= 1 ? "At least one row is required" : "Remove row"
                    }
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/5 bg-black/80 px-3 py-2">
            <button
              className="inline-flex items-center gap-1 rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[var(--accent-copper-soft)] hover:bg-[var(--accent-copper-faint)] hover:text-[var(--accent-copper-soft)]"
              onClick={addRow}
              type="button"
            >
              <span>+</span>
              <span>Add item</span>
            </button>
          </div>
        </div>

        {/* Quick paste */}
        <div className="rounded-md border border-white/10 bg-black/30 p-3">
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

          <p className="mt-2 text-[0.7rem] text-neutral-500">
            Only lines with a description and quantity &gt; 0 will be sent.
          </p>
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