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

export function NewWorkOrderLineForm(props: {
  workOrderId: string;
  vehicleId: string | null;
  defaultJobType: WOJobType | null;
  shopId?: string | null; // satisfies RLS
  onCreated?: () => void;
}) {
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
    return (t && (allowed as string[]).includes(t)) ? (t as InsertLine["job_type"]) : null;
  }

  function normalizeStatus(s: InsertLine["status"] | null | undefined): AllowedStatus {
    const v = (s ?? "awaiting") as string;
    return (ALLOWED_STATUS as readonly string[]).includes(v) ? (v as AllowedStatus) : "awaiting";
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

      const { data: { user } } = await supabase.auth.getUser();

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
    <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-white">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-neutral-400">Complaint</label>
          <input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
            placeholder="Describe the issue"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Cause</label>
          <input
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
            placeholder="Root cause (optional)"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Correction</label>
          <input
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
            placeholder="What to do (optional)"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Labor (hrs)</label>
          <input
            inputMode="decimal"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
            placeholder="0.0"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Status</label>
          <select
            value={normalizeStatus(status)}
            onChange={(e) => setStatus(e.target.value as InsertLine["status"])}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
          >
            <option value="awaiting">Awaiting</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-neutral-400">Job type</label>
          <select
            value={jobType ?? ""}
            onChange={(e) => setJobType((e.target.value || null) as WOJobType | null)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
          >
            <option value="">—</option>
            <option value="diagnosis">Diagnosis</option>
            <option value="inspection">Inspection</option>
            <option value="maintenance">Maintenance</option>
            <option value="repair">Repair</option>
          </select>
        </div>
      </div>

      {err && <div className="mt-2 text-red-400">{err}</div>}

      <div className="mt-3 flex justify-end">
        <button
          disabled={!canSave || busy}
          onClick={addLine}
          className="rounded bg-neutral-900 px-3 py-1 font-semibold text-white ring-1 ring-neutral-700 hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add Line"}
        </button>
      </div>
    </div>
  );
}

export default NewWorkOrderLineForm;