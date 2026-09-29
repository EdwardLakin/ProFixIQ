"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

import {
  diagnoseFleetVehicleBillingOwner,
  applyFleetVehicleBillingOwner,
  FleetVehicleBillingOwnerError,
  type FleetVehicleBillingOwnerResolution,
} from "@/features/fleet/lib/resolveFleetVehicleBillingOwner";
import type { FleetServiceRequestFailureReason } from "@/features/fleet/lib/fleetServiceRequestError";

type Status = "loading" | "ready" | "blocked" | "applying" | "resolved";

export default function ResolveFleetVehicleBillingOwnerModal({
  vehicleId,
  unitLabel,
  onClose,
  onResolved,
}: {
  vehicleId: string;
  unitLabel: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [resolution, setResolution] =
    useState<FleetVehicleBillingOwnerResolution | null>(null);
  const [blockedReason, setBlockedReason] =
    useState<FleetServiceRequestFailureReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function diagnose() {
      setStatus("loading");
      setError(null);
      try {
        const result = await diagnoseFleetVehicleBillingOwner(vehicleId);
        if (cancelled) return;
        setResolution(result);
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof FleetVehicleBillingOwnerError) {
          setBlockedReason(cause.reason);
          setError(cause.message);
        } else {
          setError("Unable to look up this unit's billing owner.");
        }
        setStatus("blocked");
      }
    }
    void diagnose();
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  async function applyFix() {
    setStatus("applying");
    setError(null);
    try {
      const result = await applyFleetVehicleBillingOwner(vehicleId);
      setResolution(result);
      setStatus("resolved");
    } catch (cause) {
      if (cause instanceof FleetVehicleBillingOwnerError) {
        setBlockedReason(cause.reason);
        setError(cause.message);
      } else {
        setError("Unable to resolve this unit's billing owner.");
      }
      setStatus("blocked");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-[color:var(--theme-text-primary)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-copper)]">
              Resolve billing owner
            </p>
            <h2 className="mt-1 text-lg font-semibold">{unitLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          {status === "loading" ? (
            <p className="text-[color:var(--theme-text-secondary)]">
              Checking this unit&apos;s Fleet enrollment…
            </p>
          ) : null}

          {status === "blocked" ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600 dark:text-amber-300" />
              <div className="space-y-2">
                <p role="alert">{error}</p>
                {blockedReason === "enrollment_missing" ||
                blockedReason === "enrollment_ambiguous" ? (
                  <p className="text-xs text-[color:var(--theme-text-secondary)]">
                    Fix this unit&apos;s Fleet enrollment, then try accepting
                    the request again.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {(status === "ready" || status === "applying") && resolution ? (
            resolution.alreadyAligned ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-300" />
                <p>
                  This unit&apos;s billing owner already matches{" "}
                  <span className="font-semibold">{resolution.fleetName}</span>
                  &apos;s account. You can retry accepting the request.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[color:var(--theme-text-secondary)]">
                  This unit is enrolled in{" "}
                  <span className="font-semibold text-[color:var(--theme-text-primary)]">
                    {resolution.fleetName}
                  </span>
                  , but it is currently billed to a different account.
                </p>
                <div className="rounded-xl border border-[color:var(--theme-border-soft)] p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-[color:var(--theme-text-secondary)]">
                      Current billing account
                    </span>
                    <span className="font-semibold">
                      {resolution.previousCustomerName ?? "None on file"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[color:var(--theme-text-secondary)]">
                      Fleet billing account
                    </span>
                    <span className="font-semibold">
                      {resolution.resolvedCustomerName ?? "Unnamed account"}
                    </span>
                  </div>
                </div>
              </div>
            )
          ) : null}

          {status === "resolved" && resolution ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-300" />
              <p>
                Billing owner reassigned to{" "}
                <span className="font-semibold">
                  {resolution.resolvedCustomerName ?? resolution.fleetName}
                </span>
                . You can retry accepting the request.
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Close
          </button>
          {status === "ready" && resolution && !resolution.alreadyAligned ? (
            <button
              type="button"
              onClick={() => void applyFix()}
              className="inline-flex min-h-9 items-center rounded-lg bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)]"
            >
              Reassign to Fleet billing account
            </button>
          ) : null}
          {status === "applying" ? (
            <button
              type="button"
              disabled
              className="inline-flex min-h-9 items-center rounded-lg bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)] opacity-60"
            >
              Reassigning…
            </button>
          ) : null}
          {(status === "resolved" ||
            (status === "ready" && resolution?.alreadyAligned)) ? (
            <button
              type="button"
              onClick={onResolved}
              className="inline-flex min-h-9 items-center rounded-lg bg-[var(--accent-copper)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)]"
            >
              Retry accepting request
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
