"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

// 1) Specialized renderers (lazy-loaded)
const Maintenance50Hydraulic = dynamic(() =>
  import("../screens/Maintenance50Screen")
);
const Maintenance50Air = dynamic(() =>
  import("../screens/Maintenance50AirScreen")
);

// 2) Generic schema-driven screen (handles most inspections, incl. custom)
const GenericInspectionScreen = dynamic(() =>
  import("../screens/GenericInspectionScreen")
);

type HostProps = {
  template: string; // e.g. "maintenance50-hydraulic", "maintenance50-air", "custom:<id>"
  params?: Record<string, string | number | boolean | null | undefined>;
  embed?: boolean;   // for compact layout inside modal
};

const REGISTRY: Record<string, React.ComponentType<any>> = {
  "maintenance50-hydraulic": Maintenance50Hydraulic,
  "maintenance50-air": Maintenance50Air,
  // add more specialized templates here as you create them
};

export default function InspectionHost({ template, params = {}, embed = false }: HostProps) {
  // Custom templates: "custom:123" -> handled by generic screen
  const isCustom = template.startsWith("custom:");
  const Renderer =
    (!isCustom && REGISTRY[template]) ? REGISTRY[template] : GenericInspectionScreen;

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading…</div>}>
      <Renderer params={params} embed={embed} template={template} />
    </Suspense>
  );
}