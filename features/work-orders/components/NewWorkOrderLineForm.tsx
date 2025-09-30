"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type InsertLine = DB["public"]["Tables"]["work_order_lines"]["Insert"];

// Keep in sync with your DB check constraint
type WOJobType = "diagnosis" | "inspection" | "maintenance" | "repair";

export function NewWorkOrderLineForm(props: {
  workOrderId: string;
  vehicleId: string | null;
  defaultJobType: WOJobType | null;
  shopId?: string | null;                // ← optional (used to satisfy RLS)
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

  const canSave = complaint.trim().length > 0 && !!workOrderId;

  function normalizeJobType(t: WOJobType | null): InsertLine["job_type"] {
    const allowed: WOJobType[] = ["diagnosis", "inspection", "maintenance", "repair"];
    return (t && (allowed as string[]).includes(t)) ? (t as InsertLine["job_type"]) : null;
  }

  async function addLine() {
    if (!canSave) return;
    setBusy(true);
    setErr(null);

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
      status: status ?? "awaiting",
      job_type: normalizeJobType(jobType),
      // RLS: wol_shop_insert → check (shop_id = current_shop_id())
      shop_id: shopId ?? null,
    };

    const { error } = await supabase.from("work_order_lines").insert(payload);
    if (error) {
      if (/(job_type).*check/i.test(error.message)) {
        setErr("This job type isn’t allowed by the database. Pick another type.");
      } else if (/shop_id.*current_shop_id/i.test(error.message)) {
        setErr("Shop mismatch: shop_id is missing or you’re not in this shop.");
      } else {
        setErr(error.message);
      }
    } else {
      setComplaint("");
      setCause("");
      setCorrection("");
      setLabor("");
      setStatus("awaiting");
      setJobType(defaultJobType ?? null);
      onCreated?.();
    }
    setBusy(false);
  }

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-sm text-white">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs text-neutral-400 mb-1">Complaint</label>
          <input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="Describe the issue"
          />
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1">Cause</label>
          <input
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="Root cause (optional)"
          />
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1">Correction</label>
          <input
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="What to do (optional)"
          />
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1">Labor (hrs)</label>
          <input
            inputMode="decimal"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
            placeholder="0.0"
          />
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1">Status</label>
          <select
            value={status ?? "awaiting"}
            onChange={(e) => setStatus(e.target.value as InsertLine["status"])}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
          >
            <option value="awaiting">Awaiting</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1">Job type</label>
          <select
            value={jobType ?? ""}
            onChange={(e) => setJobType((e.target.value || null) as WOJobType | null)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
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
          className="rounded bg-orange-500 px-3 py-1 font-semibold text-black disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add Line"}
        </button>
      </div>
    </div>
  );
}

export default NewWorkOrderLineForm;