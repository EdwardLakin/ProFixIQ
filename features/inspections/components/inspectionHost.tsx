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
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] px-4 py-3 text-sm text-muted-foreground shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-3 text-sm">
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