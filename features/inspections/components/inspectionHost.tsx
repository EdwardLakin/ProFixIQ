//features/inspections/components/inspectionHost.tsx

"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

/** Props our screens accept (now includes params for modal renders). */
type ScreenProps = {
  embed?: boolean;
  template?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
};

/** Host props (modal passes these). */
type HostProps = {
  template: string;                 // "maintenance50", "maintenance50-air", "custom:abc"
  embed?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>;
};

/* -------- Lazy screens -------- */
const Maintenance50 = dynamic<ScreenProps>(() => import("../screens/Maintenance50Screen"));
const Maintenance50Air = dynamic<ScreenProps>(() => import("../screens/Maintenance50AirScreen"));
const GenericInspectionScreen = dynamic<ScreenProps>(() => import("../screens/GenericInspectionScreen"));

/* -------- Registry (canonical keys) -------- */
const REGISTRY: Record<string, React.ComponentType<ScreenProps>> = {
  maintenance50: Maintenance50,
  "maintenance50-air": Maintenance50Air,
};

/* -------- Normalizer: accept a bunch of aliases safely -------- */
function normalizeTemplate(input: string): string {
  const raw = input.split("?")[0].split("#")[0];
  const t = raw.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (t === "maintenance50-hydraulic" || t === "maintenance-50" || t === "maintenance50-std")
    return "maintenance50";
  if (t === "maintenance50air" || t === "maintenance-50-air" || t === "maintenance50-air")
    return "maintenance50-air";
  return t;
}

/* -------- Host -------- */
export default function InspectionHost({ template, embed = false, params }: HostProps) {
  const key = normalizeTemplate(template);
  const isCustom = key.startsWith("custom:");
  const Renderer = (!isCustom && REGISTRY[key]) || GenericInspectionScreen;

  return (
    <Suspense fallback={<div className="p-4 text-neutral-400">Loading…</div>}>
      <Renderer embed={embed} template={key} params={params} />
    </Suspense>
  );
}