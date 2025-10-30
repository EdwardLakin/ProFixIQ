"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

/** Props that our screens may accept (both are optional on the screens themselves). */
type ScreenProps = {
  embed?: boolean;
  template?: string;
};

/** Host props coming from the caller. */
type HostProps = {
  template: string; // e.g. "maintenance50-hydraulic", "maintenance50-air", "custom:<id>"
  embed?: boolean;   // compact/iframe layout toggle
};

// 1) Specialized renderers (lazy-loaded)
const Maintenance50Hydraulic = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50Screen")
);
const Maintenance50Air = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50AirScreen")
);

// 2) Generic schema-driven screen (handles most inspections, incl. custom)
const GenericInspectionScreen = dynamic<ScreenProps>(
  () => import("../screens/GenericInspectionScreen")
);

// Registry for named templates -> screen components
const REGISTRY: Record<string, React.ComponentType<ScreenProps>> = {
  "maintenance50-hydraulic": Maintenance50Hydraulic,
  "maintenance50-air": Maintenance50Air,
  // add more specialized templates here as you create them
};

export default function InspectionHost({ template, embed = false }: HostProps) {
  // Custom templates: "custom:123" -> handled by generic screen
  const isCustom = template.startsWith("custom:");
  const Renderer = (!isCustom && REGISTRY[template]) || GenericInspectionScreen;

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading…</div>}>
      {/* Only pass props that screens are typed to accept */}
      <Renderer embed={embed} template={template} />
    </Suspense>
  );
}