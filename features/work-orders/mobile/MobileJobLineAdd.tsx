"use client";

import { useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type InsertLine = DB["public"]["Tables"]["work_order_lines"]["Insert"];

// Keep in sync with your DB check constraint
type WOJobType = "diagnosis" | "inspection" | "maintenance" | "repair";

const ALLOWED_STATUS = [
  "awaiting",
  "in_progress",
  "on_hold",
  "paused",
  "completed",
] as const;
type AllowedStatus = (typeof ALLOWED_STATUS)[number];

export type MobileJobLineAddProps = {
  workOrderId: string;
  vehicleId: string | null;
  defaultJobType: WOJobType | null;
  shopId?: string | null; // satisfies RLS
  onCreated?: () => void;
};

export function MobileJobLineAdd(props: MobileJobLineAddProps) {
  const { workOrderId, vehicleId, defaultJobType, shopId, onCreated } = props;
  const supabase = createClientComponentClient<DB>();

  const [complaint, setComplaint] = useState("");
  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [labor, setLabor] = useState<string>("");
  const [status, setStatus] = useState<InsertLine["status"]>("awaiting");
  const [jobType, setJobType] = useState<WOJobType | null>(defaultJobType ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const lastSetShopId = useRef<string | null>(null);

  const canSave = complaint.trim().length > 0 && !!workOrderId;

  function normalizeJobType(t: WOJobType | null): InsertLine["job_type"] {
    const allowed: WOJobType[] = ["diagnosis", "inspection", "maintenance", "repair"];
    return (t && (allowed as string[]).includes(t))
      ? (t as InsertLine["job_type"])
      : null;
  }

  function normalizeStatus(s: InsertLine["status"] | null | undefined): AllowedStatus {
    const v = (s ?? "awaiting") as string;
    return (ALLOWED_STATUS as readonly string[]).includes(v)
      ? (v as AllowedStatus)
      : "awaiting";
  }

  async function ensureShopContext() {
    if (!shopId) return;
    if (lastSetShopId.current === shopId) return;
    const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
    if (!error) lastSetShopId.current = shopId;
    else throw error;
  }

  async function addLine() {
    if (!canSave) return;
    setBusy(true);
    setErr(null);

    try {
      await ensureShopContext();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: InsertLine = {
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        user_id: user?.id ?? null,
        complaint: complaint || null,
        cause: cause || null,
        correction: correction || null,
        labor_time: labor ? Number(labor) : null,
        status: normalizeStatus(status),
        job_type: normalizeJobType(jobType),
        shop_id: shopId ?? null,
      };

      const { error } = await supabase.from("work_order_lines").insert(payload);
      if (error) {
        if (/(job_type).*check/i.test(error.message)) {
          setErr("This job type isn’t allowed by the database. Pick another type.");
        } else if (/status.*check/i.test(error.message)) {
          setErr("This status isn’t allowed by the database. Try a different status.");
        } else if (/row-level security/i.test(error.message) || /current_shop_id/i.test(error.message)) {
          setErr("Shop mismatch: your session isn’t scoped to this shop. Try again.");
          lastSetShopId.current = null;
        } else {
          setErr(error.message);
        }
        return;
      }

      setComplaint("");
      setCause("");
      setCorrection("");
      setLabor("");
      setStatus("awaiting");
      setJobType(defaultJobType ?? null);
      onCreated?.();

      // Let other widgets refresh
      window.dispatchEvent(new CustomEvent("wo:line-added"));
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "Failed to add line.";
      setErr(msg);
      lastSetShopId.current = null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black/70 p-4 text-sm text-white shadow-md shadow-black/60">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-neutral-50">
            Add Job Line
          </h2>
          <p className="text-[11px] text-neutral-400">
            Complaint is required. Fill in cause/correction as you go.
          </p>
        </div>
        <div className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[10px] font-mono text-neutral-300">
          WO {workOrderId.slice(0, 6)}…
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-3">
        {/* Complaint */}
        <div className="space-y-1">
          <label className="text-xs text-neutral-300">
            Complaint <span className="text-red-400">*</span>
          </label>
          <textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="w-full min-h-[80px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="Describe the concern (what the customer reports)…"
          />
        </div>

        {/* Cause */}
        <div className="space-y-1">
          <label className="text-xs text-neutral-300">Cause</label>
          <textarea
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            className="w-full min-h-[64px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="Root cause (you can fill this in later)"
          />
        </div>

        {/* Correction */}
        <div className="space-y-1">
          <label className="text-xs text-neutral-300">Correction</label>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            className="w-full min-h-[64px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="Plan / repair performed"
          />
        </div>

        {/* Labor */}
        <div className="space-y-1">
          <label className="text-xs text-neutral-300">Labor (hrs)</label>
          <input
            inputMode="decimal"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="0.0"
          />
          <p className="text-[10px] text-neutral-500">
            Flat-rate or estimated hours. Leave blank if unknown.
          </p>
        </div>

        {/* Status + Job type */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-neutral-300">Status</label>
            <select
              value={normalizeStatus(status)}
              onChange={(e) =>
                setStatus(e.target.value as InsertLine["status"])
              }
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="awaiting">Awaiting</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex-1 space-y-1">
            <label className="text-xs text-neutral-300">Job type</label>
            <select
              value={jobType ?? ""}
              onChange={(e) =>
                setJobType((e.target.value || null) as WOJobType | null)
              }
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="">Unspecified</option>
              <option value="diagnosis">Diagnosis</option>
              <option value="inspection">Inspection</option>
              <option value="maintenance">Maintenance</option>
              <option value="repair">Repair</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="rounded-md border border-red-500/60 bg-red-900/20 px-3 py-2 text-xs text-red-200">
          {err}
        </div>
      )}

      {/* Sticky-ish bottom actions */}
      <div className="pt-1">
        <button
          type="button"
          disabled={!canSave || busy}
          onClick={addLine}
          className="flex w-full items-center justify-center rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black shadow-lg shadow-orange-500/30 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add line to work order"}
        </button>
      </div>
    </div>
  );
}

export default MobileJobLineAdd;