//features/work-orders/components/NewWorkOrderLineForm.tsx

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type SmartRepairMatch = {
  id: string;
  label: string;
  complaint?: string | null;
  correction?: string | null;
  laborHours?: number | null;
  parts?: Array<{ name: string; qty?: number }>;
  score?: number | null;
  confidence?: number | null;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
  autoAcceptReady?: boolean;
  matchTier?: "high" | "medium" | "low";
  acceptedCount?: number | null;
  acceptanceRate?: number | null;
};


function isTopRepairDefault(match: SmartRepairMatch | null): boolean {
  if (!match?.menuRepairItemId) return false;

  const accepted =
    typeof match.acceptedCount === "number" ? match.acceptedCount : 0;
  const rate =
    typeof match.acceptanceRate === "number" ? match.acceptanceRate : 0;
  const confidence =
    typeof match.confidence === "number" ? match.confidence : 0;

  return accepted >= 3 && rate >= 0.8 && confidence >= 0.85;
}

type VehicleLite = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "engine" | "drivetrain" | "transmission"
>;

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

  const [vehicle, setVehicle] = useState<VehicleLite | null>(null);
  const [smartMatch, setSmartMatch] = useState<SmartRepairMatch | null>(null);
  const [smartMatchLoading, setSmartMatchLoading] = useState(false);

  const smartMatchTimer = useRef<number | null>(null);

  const canSave = complaint.trim().length > 0 && !!workOrderId;
  const topRepairDefault = isTopRepairDefault(smartMatch);

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

  useEffect(() => {
    let cancelled = false;

    async function loadVehicle() {
      if (!vehicleId) {
        setVehicle(null);
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .select("id, year, make, model, engine, drivetrain, transmission")
        .eq("id", vehicleId)
        .maybeSingle<VehicleLite>();

      if (cancelled) return;
      if (error || !data) {
        setVehicle(null);
        return;
      }

      setVehicle(data);
    }

    void loadVehicle();

    return () => {
      cancelled = true;
    };
  }, [supabase, vehicleId]);

  useEffect(() => {
    const term = complaint.trim();

    if (smartMatchTimer.current) {
      window.clearTimeout(smartMatchTimer.current);
      smartMatchTimer.current = null;
    }

    if (term.length < 5 || !workOrderId) {
      setSmartMatch(null);
      setSmartMatchLoading(false);
      return;
    }

    smartMatchTimer.current = window.setTimeout(async () => {
      setSmartMatchLoading(true);
      try {
        const res = await fetch("/api/work-orders/smart-repair-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: term,
            notes: term,
            section: "create_work_order",
            status: "draft",
            vehicle: vehicle
              ? {
                  year: vehicle.year,
                  make: vehicle.make,
                  model: vehicle.model,
                  engine: vehicle.engine,
                  drivetrain: vehicle.drivetrain,
                  transmission: vehicle.transmission,
                }
              : null,
          }),
        });

        const json = (await res.json().catch(() => null)) as
          | { match?: SmartRepairMatch | null }
          | null;

        if (!res.ok) {
          setSmartMatch(null);
          return;
        }

        const raw = json?.match ?? null;
        const confidence =
          raw && typeof raw.confidence === "number" ? raw.confidence : 0;

        setSmartMatch(
          raw
            ? {
                ...raw,
                autoAcceptReady:
                  Boolean(raw.menuRepairItemId) && confidence >= 0.9,
                matchTier:
                  confidence >= 0.9
                    ? "high"
                    : confidence >= 0.7
                      ? "medium"
                      : "low",
              }
            : null,
        );
      } catch {
        setSmartMatch(null);
      } finally {
        setSmartMatchLoading(false);
      }
    }, 550);

    return () => {
      if (smartMatchTimer.current) {
        window.clearTimeout(smartMatchTimer.current);
        smartMatchTimer.current = null;
      }
    };
  }, [complaint, vehicle, workOrderId]);

  function applySmartMatch(match: SmartRepairMatch) {
    setComplaint(match.complaint?.trim() || match.label || "");
    setCorrection(match.correction?.trim() || "");
    if (
      typeof match.laborHours === "number" &&
      Number.isFinite(match.laborHours)
    ) {
      setLabor(String(match.laborHours));
    }
    setJobType("repair");
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
      // Prefer exact vehicle-specific repair if available
      if (smartMatch?.menuRepairItemId) {
        const repairRes = await fetch("/api/work-orders/lines/add-from-menu-repair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId,
            menuRepairItemId: smartMatch.menuRepairItemId,
            notes: complaint.trim() || null,
            laborHours: labor ? Number(labor) : smartMatch.laborHours ?? null,
          }),
        });

        const repairJson = (await repairRes.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!repairRes.ok || !repairJson?.ok) {
          setErr(repairJson?.error || "Failed to add matched repair line.");
          return;
        }

        setComplaint("");
        setCause("");
        setCorrection("");
        setLabor("");
        setStatus("awaiting");
        setJobType(defaultJobType ?? null);
        setSmartMatch(null);

        onCreated?.();
        window.dispatchEvent(new CustomEvent("wo:line-added"));
        return;
      }

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
      setSmartMatch(null);

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

        {smartMatchLoading ? (
          <div className="sm:col-span-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300">
            Looking for a matching quoted repair…
          </div>
        ) : smartMatch ? (
          <div className="sm:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.16em] text-emerald-200/80">
                  Smart repair match
                </div>
                <div className="mt-1 text-sm font-semibold text-emerald-100">
                  {smartMatch.label}
                </div>
                {(smartMatch.correction || smartMatch.complaint) && (
                  <div className="mt-1 text-xs text-emerald-50/85">
                    {smartMatch.correction || smartMatch.complaint}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-100/90">
                  {typeof smartMatch.laborHours === "number" && (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      {smartMatch.laborHours} hr
                    </span>
                  )}
                  {typeof smartMatch.confidence === "number" && (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      {Math.round(smartMatch.confidence * 100)}% confidence
                    </span>
                  )}
                  {smartMatch.menuRepairItemId && (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      vehicle-specific repair
                    </span>
                  )}
                  {smartMatch.matchTier && (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      {smartMatch.matchTier} confidence tier
                    </span>
                  )}
                  {smartMatch.autoAcceptReady && (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      quote-skip ready
                    </span>
                  )}

                  {typeof smartMatch.acceptedCount === "number" &&
                  smartMatch.acceptedCount > 0 ? (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      {smartMatch.acceptedCount} accepted
                    </span>
                  ) : null}
                  {typeof smartMatch.acceptanceRate === "number" &&
                  smartMatch.acceptanceRate > 0 ? (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      {Math.round(smartMatch.acceptanceRate * 100)}% win rate
                    </span>
                  ) : null}

                  {topRepairDefault ? (
                    <span className="rounded-full border border-emerald-400/30 px-2 py-0.5">
                      default winner
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applySmartMatch(smartMatch)}
                  className="rounded-md border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20"
                >
                  Use match
                </button>
                <button
                  type="button"
                  onClick={() => setSmartMatch(null)}
                  className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}

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
          {busy
            ? "Adding…"
            : smartMatch?.menuRepairItemId
              ? "Add matched repair"
              : "Add line to work order"}
        </button>
      </div>
    </div>
  );
}

export default NewWorkOrderLineForm;
