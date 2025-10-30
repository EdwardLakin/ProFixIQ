"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

/** Props our screens accept (tight-typed). */
type ScreenProps = {
  embed?: boolean;
  template?: string;
};

/** Host props (called by InspectionModal). */
type HostProps = {
  template: string; // e.g. "maintenance50", "maintenance50-air", "custom:<id>"
  embed?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>;
};

/* -------------------- Lazy-loaded inspection screens -------------------- */

// Base 50-point inspection (hydraulic)
const Maintenance50 = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50Screen")
);

// Air-brake version
const Maintenance50Air = dynamic<ScreenProps>(
  () => import("../screens/Maintenance50AirScreen")
);

// Fallback schema-driven generic inspection
const GenericInspectionScreen = dynamic<ScreenProps>(
  () => import("../screens/GenericInspectionScreen")
);

/* -------------------- Template registry -------------------- */

const REGISTRY: Record<string, React.ComponentType<ScreenProps>> = {
  "maintenance50": Maintenance50,          // ✅ your base file
  "maintenance50-air": Maintenance50Air,   // ✅ your air variant
  // optional legacy alias
  "maintenance50-hydraulic": Maintenance50,
};

/* -------------------- Host component -------------------- */

export default function InspectionHost({ template, embed = false }: HostProps) {
  const isCustom = template.startsWith("custom:");
  const Renderer = (!isCustom && REGISTRY[template]) || GenericInspectionScreen;

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading…</div>}>
      <Renderer embed={embed} template={template} />
    </Suspense>
  );
}