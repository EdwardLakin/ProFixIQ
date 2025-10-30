"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

/** Props our screens accept (keep tight so extra props don't slip through). */
type ScreenProps = {
  embed?: boolean;
  template?: string;
};

/** Back-compat host props.
 *  NOTE: `params` is accepted because some callers still pass it,
 *  but it is intentionally NOT forwarded to the screen.
 */
type HostProps = {
  template: string; // e.g. "maintenance50-hydraulic", "maintenance50-air", "custom:<id>"
  embed?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>;
};

// Specialized renderers (lazy-loaded)
const Maintenance50Hydraulic = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50Screen")
);
const Maintenance50Air = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50AirScreen")
);

// Generic schema-driven screen (default)
const GenericInspectionScreen = dynamic<ScreenProps>(
  () => import("../screens/GenericInspectionScreen")
);

// Template registry
const REGISTRY: Record<string, React.ComponentType<ScreenProps>> = {
  "maintenance50-hydraulic": Maintenance50Hydraulic,
  "maintenance50-air": Maintenance50Air,
  // add more specialized templates here
};

export default function InspectionHost({ template, embed = false }: HostProps) {
  const isCustom = template.startsWith("custom:");
  const Renderer = (!isCustom && REGISTRY[template]) || GenericInspectionScreen;

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading…</div>}>
      {/* Do NOT forward `params` — screens don't accept it */}
      <Renderer embed={embed} template={template} />
    </Suspense>
  );
}