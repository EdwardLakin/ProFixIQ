// /features/work-orders/components/workorders/DeleteOrVoidLineModal.tsx
"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Allocation = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

type Disposition = "return_to_stock" | "keep_consumed" | "scrap";
type Mode = "delete" | "void";

type Props = {
  open: boolean;
  onClose: () => void;
  line: WorkOrderLine;
  allocations: Allocation[];
  /** optional: call to refresh the parent view */
  onDone?: () => void;
};

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

export default function DeleteOrVoidLineModal({
  open,
  onClose,
  line,
  allocations,
  onDone,
}: Props): JSX.Element | null {
  const [mode, setMode] = useState<Mode>("void");
  const [disposition, setDisposition] = useState<Disposition>("keep_consumed");
  const [reason, setReason] = useState<string>("Customer declined");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const lineStatus = safeTrim(line.status).toLowerCase();

  const hasAllocs = allocations.length > 0;

  const hardDeleteAllowed = useMemo(() => {
    // We only allow hard delete if it's clearly a “draft-ish” line and no parts exist.
    if (hasAllocs) return false;
    if (["completed", "ready_to_invoice", "invoiced"].includes(lineStatus)) {
      return false;
    }
    return true;
  }, [hasAllocs, lineStatus]);

  const title = hasAllocs ? "Delete / Void Line (Parts exist)" : "Delete / Void Line";

  if (!open) return null;

  const submit = async () => {
    if (busy) return;

    const r = reason.trim();
    if (!r) {
      toast.error("Reason is required.");
      return;
    }

    if (mode === "delete" && !hardDeleteAllowed) {
      toast.error("Hard delete is not allowed for this line. Use Void.");
      return;
    }

    if (hasAllocs && !disposition) {
      toast.error("Choose what to do with parts.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `/api/work-orders/lines/${encodeURIComponent(line.id)}/delete-or-void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            disposition: hasAllocs ? disposition : undefined,
            reason: r,
            note: note.trim() ? note.trim() : null,
          }),
        },
      );

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; mode?: string }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed.");
      }

      toast.success(
        json.mode === "deleted" ? "Line deleted." : "Line voided.",
      );

      onClose();
      onDone?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.75)] backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 text-sm font-semibold text-white">{title}</div>

        <div className="text-[11px] text-neutral-300">
          <div className="truncate">
            <span className="text-neutral-400">Line:</span>{" "}
            {line.description || line.complaint || "Untitled job"}
          </div>
          <div className="mt-1">
            <span className="text-neutral-400">Status:</span>{" "}
            {(line.status ?? "awaiting").replaceAll("_", " ")}
          </div>
          <div className="mt-1">
            <span className="text-neutral-400">Parts on line:</span>{" "}
            {allocations.length}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {/* Mode */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
              Action
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-start gap-2 text-sm text-neutral-200">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "void"}
                  onChange={() => setMode("void")}
                />
                <span>
                  <span className="font-semibold text-white">Void / Cancel</span>
                  <div className="text-[11px] text-neutral-400">
                    Recommended. Keeps an audit trail and handles parts safely.
                  </div>
                </span>
              </label>

              <label
                className={[
                  "flex items-start gap-2 text-sm text-neutral-200",
                  hardDeleteAllowed ? "" : "opacity-60",
                ].join(" ")}
                title={
                  hardDeleteAllowed
                    ? "Hard delete allowed for this line."
                    : "Hard delete disabled (completed/invoiced or parts exist)."
                }
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "delete"}
                  onChange={() => setMode("delete")}
                  disabled={!hardDeleteAllowed}
                />
                <span>
                  <span className="font-semibold text-white">Hard delete</span>
                  <div className="text-[11px] text-neutral-400">
                    Only allowed when no parts exist and line isn&apos;t completed.
                  </div>
                </span>
              </label>
            </div>
          </div>

          {/* Parts disposition */}
          {hasAllocs && (
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
                Parts handling
              </div>

              <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-200">
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="disp"
                    checked={disposition === "return_to_stock"}
                    onChange={() => setDisposition("return_to_stock")}
                  />
                  <span>
                    <span className="font-semibold text-white">
                      Return parts to stock
                    </span>
                    <div className="text-[11px] text-neutral-400">
                      Creates a stock move (reason: return_in) and removes allocations.
                    </div>
                  </span>
                </label>

                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="disp"
                    checked={disposition === "keep_consumed"}
                    onChange={() => setDisposition("keep_consumed")}
                  />
                  <span>
                    <span className="font-semibold text-white">
                      Parts were used / keep consumed
                    </span>
                    <div className="text-[11px] text-neutral-400">
                      Leaves inventory as-is; removes allocations so customer isn’t charged.
                    </div>
                  </span>
                </label>

                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="disp"
                    checked={disposition === "scrap"}
                    onChange={() => setDisposition("scrap")}
                  />
                  <span>
                    <span className="font-semibold text-white">Scrap</span>
                    <div className="text-[11px] text-neutral-400">
                      Same as “keep consumed” for now (inventory unchanged), but records reason.
                    </div>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Reason / note */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
              Reason
            </div>

            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-2.5 py-2 text-sm text-white outline-none focus:border-[color:var(--accent-copper,#f97316)]/60"
            >
              <option>Customer declined</option>
              <option>Duplicate line</option>
              <option>Wrong job / created by mistake</option>
              <option>Warranty / no charge</option>
              <option>Other</option>
            </select>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 min-h-[90px] w-full rounded-lg border border-white/10 bg-black/60 px-2.5 py-2 text-sm text-white outline-none focus:border-[color:var(--accent-copper,#f97316)]/60"
              placeholder="Optional note…"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-white/15 bg-black/40 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-black/60 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-500/15 disabled:opacity-60"
          >
            {busy ? "Working…" : mode === "delete" ? "Delete line" : "Void line"}
          </button>
        </div>
      </div>
    </div>
  );
}