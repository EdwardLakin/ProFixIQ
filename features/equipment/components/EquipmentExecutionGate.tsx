"use client";

import { useEffect, useState, type ReactNode } from "react";

import { inspectionSectionsRequireEquipment } from "@/features/equipment/lib/equipmentInspectionContent";

type GateState = "checking" | "allowed" | "denied" | "error";

function readStagedSections(): unknown {
  try {
    const raw =
      sessionStorage.getItem("inspection:sections") ??
      sessionStorage.getItem("customInspection:sections");
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Shared execution boundary for every inspection runner (shop fill, mobile and
 * generic screens). Staged sections containing Equipment/off-road content are
 * re-authorized against the canonical entitlement before the runner mounts, so
 * a cancelled shop cannot launch an existing off-road template from any
 * launcher. Verification outages fail closed with an in-place retry.
 */
export default function EquipmentExecutionGate({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<GateState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (!inspectionSectionsRequireEquipment(readStagedSections())) {
      setState("allowed");
      return;
    }

    setState("checking");
    void fetch("/api/equipment/entitlement", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Equipment entitlement unavailable");
        return (await response.json()) as { enabled?: boolean };
      })
      .then((payload) => {
        if (active) setState(payload.enabled === true ? "allowed" : "denied");
      })
      .catch((error) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setState("error");
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  if (state === "allowed") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
        Verifying Equipment access…
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-3 py-4">
      <div
        role="alert"
        className="max-w-md space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
      >
        <div className="font-semibold">
          {state === "denied"
            ? "An active Equipment subscription is required to run this inspection."
            : "Equipment access could not be verified. Retry before starting this inspection."}
        </div>
        {state === "error" ? (
          <button
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
            className="min-h-9 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold transition hover:bg-amber-500/10"
          >
            Retry verification
          </button>
        ) : null}
      </div>
    </div>
  );
}
