"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

/** Props our screens accept */
type ScreenProps = { embed?: boolean; template?: string };
/** Host props (modal passes these) */
type HostProps = {
  template: string;                 // e.g. "maintenance50", "maintenance50-air", "custom:abc"
  embed?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>; // ignored
};

/* -------- Lazy screens -------- */
const Maintenance50 = dynamic<ScreenProps>(() => import("../screens/Maintenance50Screen"));
const Maintenance50Air = dynamic<ScreenProps>(() => import("../screens/Maintenance50AirScreen"));
const GenericInspectionScreen = dynamic<ScreenProps>(() => import("../screens/GenericInspectionScreen"));

/* -------- Registry (canonical keys) -------- */
const REGISTRY: Record<string, React.ComponentType<ScreenProps>> = {
  "maintenance50": Maintenance50,
  "maintenance50-air": Maintenance50Air,
};

/* -------- Normalizer: accept a bunch of aliases safely -------- */
function normalizeTemplate(input: string): string {
  // strip query/hash noise just in case (defensive)
  const raw = input.split("?")[0].split("#")[0];

  // lowercase and normalize separators
  const t = raw.trim().toLowerCase().replace(/[_\s]+/g, "-");

  // common aliases -> canonical keys
  if (t === "maintenance50-hydraulic" || t === "maintenance-50" || t === "maintenance50-std")
    return "maintenance50";
  if (t === "maintenance50air" || t === "maintenance-50-air" || t === "maintenance50-air")
    return "maintenance50-air";

  // already canonical or something else (custom:xyz, etc.)
  return t;
}

/* -------- Host -------- */
export default function InspectionHost({ template, embed = false }: HostProps) {
  const key = normalizeTemplate(template);
  const isCustom = key.startsWith("custom:");
  const Renderer = (!isCustom && REGISTRY[key]) || GenericInspectionScreen;

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading…</div>}>
      <Renderer embed={embed} template={key} />
    </Suspense>
  );
}