// features/inspections/components/inspectionHost.tsx

"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type SpecHintPayload = {
  source:
    | "air_corner"
    | "corner"
    | "tire"
    | "item"
    | "battery"
    | "other";
  label: string;
  specCode?: string | null;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type ScreenProps = {
  embed?: boolean;
  template?: string | null;
  params?: Record<string, string | number | boolean | null | undefined>;
  onSpecHint?: (payload: SpecHintPayload) => void;
};

export type HostProps = {
  template: string;
  embed?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>;
  onSpecHint?: (payload: SpecHintPayload) => void;
};

/* ------------------------------------------------------------------ */
/* Generic screen (only)                                              */
/* ------------------------------------------------------------------ */

const GenericInspectionScreen = dynamic<ScreenProps>(
  () => import("../screens/GenericInspectionScreen"),
);

/* ------------------------------------------------------------------ */
/* Normalizer                                                         */
/* ------------------------------------------------------------------ */

function normalizeTemplate(input: string): string {
  const raw = input.split("?")[0].split("#")[0];
  return raw.trim().toLowerCase();
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
      <GenericInspectionScreen
        embed={embed}
        template={key}
        params={params}
        onSpecHint={onSpecHint}
      />
    </Suspense>
  );
}