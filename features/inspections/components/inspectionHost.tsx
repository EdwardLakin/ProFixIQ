// features/inspections/components/inspectionHost.tsx

"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type SpecHintPayload = {
  /** Where the hint request came from (so the UI can style/anchor it). */
  source:
    | "air_corner"   // AirCornerGrid (Steer / Drive / Trailer grids)
    | "corner"       // Hydraulic CornerGrid (LF / RF / LR / RR)
    | "item"         // Generic line item (non-grid)
    | "battery"      // Battery grid
    | "other";

  /** Raw human label, e.g. "Steer 1 Left Tread Depth" or "Kingpins (play/wear)" */
  label: string;

  /**
   * Optional canonical CVIP spec key, if the screen can resolve it:
   * e.g. "tire_tread_steer_min", "kingpin_radial", "brake_lining_front_disc".
   * Screens can pass null/undefined if they only have the label.
   */
  specCode?: string | null;

  /** Optional extra context you may want later (axle, corner, etc.) */
  meta?: Record<string, string | number | boolean | null | undefined>;
};

/** Props our screens accept (now includes params + spec hint callback). */
export type ScreenProps = {
  embed?: boolean;
  template?: string;
  params?: Record<string, string | number | boolean | null | undefined>;

  /**
   * Optional CVIP spec hint hook.
   * GenericInspectionScreen / Maintenance50* can call this when a user clicks
   * “Spec” / “CVIP” / “What’s the fail for this?” on an item.
   */
  onSpecHint?: (payload: SpecHintPayload) => void;
};

/** Host props (modal / pages pass these in). */
export type HostProps = {
  template: string; // "maintenance50", "maintenance50-air", "custom:abc", "generic", etc.
  embed?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>;

  /** Bubble hint events up to the modal / page shell (optional). */
  onSpecHint?: (payload: SpecHintPayload) => void;
};

/* ------------------------------------------------------------------ */
/* Lazy screens                                                       */
/* ------------------------------------------------------------------ */

const Maintenance50 = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50Screen"),
);
const Maintenance50Air = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50AirScreen"),
);
const GenericInspectionScreen = dynamic<ScreenProps>(
  () => import("../screens/GenericInspectionScreen"),
);

/* ------------------------------------------------------------------ */
/* Registry (canonical keys)                                         */
/* ------------------------------------------------------------------ */

const REGISTRY: Record<string, React.ComponentType<ScreenProps>> = {
  maintenance50: Maintenance50,
  "maintenance50-air": Maintenance50Air,
};

/* ------------------------------------------------------------------ */
/* Normalizer: accept a bunch of aliases safely                       */
/* ------------------------------------------------------------------ */

function normalizeTemplate(input: string): string {
  const raw = input.split("?")[0].split("#")[0];
  const t = raw.trim().toLowerCase().replace(/[_\s]+/g, "-");

  if (t === "maintenance50-hydraulic" || t === "maintenance-50" || t === "maintenance50-std") {
    return "maintenance50";
  }

  if (t === "maintenance50air" || t === "maintenance-50-air" || t === "maintenance50-air") {
    return "maintenance50-air";
  }

  return t;
}

/* ------------------------------------------------------------------ */
/* Host                                                               */
/* ------------------------------------------------------------------ */

export default function InspectionHost({
  template,
  embed = false,
  params,
  onSpecHint,
}: HostProps) {
  const key = normalizeTemplate(template);
  const isCustom = key.startsWith("custom:");
  const Renderer = (!isCustom && REGISTRY[key]) || GenericInspectionScreen;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] px-4 py-3 text-sm text-muted-foreground shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <div className="rounded-xl border border-slate-700/60 bg-slate-950/80 px-4 py-3 text-sm">
              Loading inspection…
            </div>
          </div>
        </div>
      }
    >
      <Renderer
        embed={embed}
        template={key}
        params={params}
        onSpecHint={onSpecHint}
      />
    </Suspense>
  );
}