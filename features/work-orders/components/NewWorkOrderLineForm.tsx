//features/work-orders/components/NewWorkOrderLineForm.tsx

"use client";

import { useMemo, useState } from "react";
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
  shopId?: string | null; // REQUIRED for your shop-based models
  onCreated?: () => void;
}) {
  const { workOrderId, vehicleId, defaultJobType, shopId, onCreated } = props;

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [complaint, setComplaint] = useState("");
  const [cause, setCause] = useState("");
  const [correction, setCorrection] = useState("");
  const [labor, setLabor] = useState<string>("");
  const [status, setStatus] = useState<InsertLine["status"]>("awaiting");
  const [jobType, setJobType] = useState<WOJobType | null>(
    defaultJobType ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = complaint.trim().length > 0 && !!workOrderId;

  function normalizeJobType(t: WOJobType | null): InsertLine["job_type"] {
    const allowed: WOJobType[] = [
      "diagnosis",
      "inspection",
      "maintenance",
      "repair",
    ];
    return t && (allowed as string[]).includes(t)
      ? (t as InsertLine["job_type"])
      : null;
  }

  function normalizeStatus(
    s: InsertLine["status"] | null | undefined,
  ): AllowedStatus {
    const v = (s ?? "awaiting") as string;
    return (ALLOWED_STATUS as readonly string[]).includes(v)
      ? (v as AllowedStatus)
      : "awaiting";
  }

  async function addLine() {
    if (!canSave) return;

    // If shopId is missing, we don’t even try — this almost always turns into a 403 anyway.
    if (!shopId) {
      setErr(
        "Missing shopId for this work order. Refresh the page and click “Save & Continue” first so the work order loads its shop context.",
      );
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload: InsertLine = {
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        user_id: user?.id ?? null,
        complaint: complaint.trim() || null,
        cause: cause.trim() || null,
        correction: correction.trim() || null,
        labor_time: labor ? Number(labor) : null,
        status: normalizeStatus(status),
        job_type: normalizeJobType(jobType),

        // IMPORTANT: keep shop_id explicit so all RLS/shop triggers stay deterministic
        shop_id: shopId,
      };

      const { data, error } = await supabase
        .from("work_order_lines")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        const msg = error.message || "Insert failed";

        if (/(job_type).*check/i.test(msg)) {
          setErr("This job type isn’t allowed by the database. Pick another type.");
        } else if (/status.*check/i.test(msg)) {
          setErr("This status isn’t allowed by the database. Try a different status.");
        } else if (/row-level security/i.test(msg) || /permission/i.test(msg)) {
          setErr(
            `Permission blocked (RLS). workOrderId=${workOrderId} shopId=${shopId}. ${msg}`,
          );
        } else {
          setErr(msg);
        }
        return;
      }

      if (!data?.id) {
        setErr("Insert succeeded but no row was returned. Check PostgREST preferences.");
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 sm:p-5 text-sm text-white space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Add job line</h3>
          <p className="text-[11px] text-neutral-400">
            Complaint is required. Cause / correction can be filled in later.
          </p>
        </div>
        <div className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[10px] text-neutral-300">
          Linked to WO:{" "}
          <span className="font-mono">{workOrderId.slice(0, 8)}…</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1">
          <label className="mb-0.5 block text-xs text-neutral-300">
            Complaint <span className="text-red-400">*</span>
          </label>
          <textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            className="w-full min-h-[60px] rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="Describe the issue / customer concern"
          />
        </div>

        <div className="space-y-1">
          <label className="mb-0.5 block text-xs text-neutral-300">Cause</label>
          <textarea
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            className="w-full min-h-[48px] rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="Root cause (optional)"
          />
        </div>

        <div className="space-y-1">
          <label className="mb-0.5 block text-xs text-neutral-300">Correction</label>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            className="w-full min-h-[48px] rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="What to do / repair plan (optional)"
          />
        </div>

        <div className="space-y-1">
          <label className="mb-0.5 block text-xs text-neutral-300">Labor (hrs)</label>
          <input
            inputMode="decimal"
            value={labor}
            onChange={(e) => setLabor(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
            placeholder="0.0"
          />
          <p className="text-[10px] text-neutral-500">
            Flat-rate or estimated hours. Leave blank if unknown.
          </p>
        </div>

        <div className="space-y-1">
          <label className="mb-0.5 block text-xs text-neutral-300">Status</label>
          <select
            value={normalizeStatus(status)}
            onChange={(e) => setStatus(e.target.value as InsertLine["status"])}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            <option value="awaiting">Awaiting</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="mb-0.5 block text-xs text-neutral-300">Job type</label>
          <select
            value={jobType ?? ""}
            onChange={(e) => setJobType((e.target.value || null) as WOJobType | null)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            <option value="">Unspecified</option>
            <option value="diagnosis">Diagnosis</option>
            <option value="inspection">Inspection</option>
            <option value="maintenance">Maintenance</option>
            <option value="repair">Repair</option>
          </select>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          disabled={!canSave || busy}
          onClick={addLine}
          className="btn btn-orange px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add line to work order"}
        </button>
      </div>
    </div>
  );
}

export default NewWorkOrderLineForm;