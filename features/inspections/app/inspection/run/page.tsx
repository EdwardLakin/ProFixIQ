"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import toast from "react-hot-toast";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

/* ------------------------------------------------------------------ */
/* Regex helpers to detect existing “corner grid” sections             */
/* ------------------------------------------------------------------ */

// LF/RF/LR/RR ...
const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;

// Steer/Drive/Tag/Trailer <N> Left|Right ...
const AIR_ITEM_RE =
  /^(Steer\s*\d*|Drive\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i;

/** Remove any section that appears to be a corner grid to prevent duplicates. */
function stripExistingCornerGrids(sections: Section[]): Section[] {
  return sections.filter((s) => {
    const items = s.items ?? [];
    const looksHyd = items.some((it) => HYD_ITEM_RE.test(it.item || ""));
    const looksAir = items.some((it) => AIR_ITEM_RE.test(it.item || ""));
    return !(looksHyd || looksAir);
  });
}

/* ------------------------------------------------------------------ */
/* Canonical corner grid builders (labels match AxlesCornerGrid)       */
/* ------------------------------------------------------------------ */

function buildHydraulicCornerSection(): Section {
  const metrics: Array<{ label: string; unit: string | null }> = [
    { label: "Tire Pressure", unit: "psi" },
    { label: "Tire Tread", unit: "mm" },
    { label: "Brake Pad", unit: "mm" },
    { label: "Rotor", unit: "mm" },
    { label: "Rotor Condition", unit: null },
    { label: "Rotor Thickness", unit: "mm" },
    { label: "Wheel Torque", unit: "ft·lb" },
  ];
  const corners = ["LF", "RF", "LR", "RR"];
  const items: SectionItem[] = [];
  for (const c of corners) for (const m of metrics) items.push({ item: `${c} ${m.label}`, unit: m.unit });
  return { title: "Corner Grid (Hydraulic)", items };
}

/** Default air corner grid: Steer 1 + Drive 1 (explicit Inner/Outer where needed) */
function buildAirCornerSection(): Section {
  const steer: SectionItem[] = [
    { item: "Steer 1 Left Tire Pressure", unit: "psi" },
    { item: "Steer 1 Right Tire Pressure", unit: "psi" },
    { item: "Steer 1 Left Tread Depth", unit: "mm" },
    { item: "Steer 1 Right Tread Depth", unit: "mm" },
    { item: "Steer 1 Left Lining/Shoe", unit: "mm" },
    { item: "Steer 1 Right Lining/Shoe", unit: "mm" },
    { item: "Steer 1 Left Drum/Rotor", unit: "mm" },
    { item: "Steer 1 Right Drum/Rotor", unit: "mm" },
    { item: "Steer 1 Left Push Rod Travel", unit: "in" },
    { item: "Steer 1 Right Push Rod Travel", unit: "in" },
  ];

  const drive: SectionItem[] = [
    { item: "Drive 1 Left Tire Pressure", unit: "psi" },
    { item: "Drive 1 Right Tire Pressure", unit: "psi" },
    { item: "Drive 1 Left Tread Depth (Outer)", unit: "mm" },
    { item: "Drive 1 Left Tread Depth (Inner)", unit: "mm" },
    { item: "Drive 1 Right Tread Depth (Outer)", unit: "mm" },
    { item: "Drive 1 Right Tread Depth (Inner)", unit: "mm" },
    { item: "Drive 1 Left Lining/Shoe", unit: "mm" },
    { item: "Drive 1 Right Lining/Shoe", unit: "mm" },
    { item: "Drive 1 Left Drum/Rotor", unit: "mm" },
    { item: "Drive 1 Right Drum/Rotor", unit: "mm" },
    { item: "Drive 1 Left Push Rod Travel", unit: "in" },
    { item: "Drive 1 Right Push Rod Travel", unit: "in" },
  ];

  return { title: "Corner Grid (Air)", items: [...steer, ...drive] };
}

/* ------------------------------------------------------------------ */
/* Deterministic grid selection (URL override > vehicle_type)          */
/* ------------------------------------------------------------------ */

/**
 * Choose which grid to inject:
 *  - URL ?grid=air|hyd|none wins (for quick testing)
 *  - else vehicleType: truck/bus/trailer => air, otherwise hyd
 *  - If "none", we do not inject a grid, but we still strip duplicates if present.
 */
function prepareSectionsWithCornerGrid(
  sections: Section[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): Section[] {
  const s = Array.isArray(sections) ? (sections as Section[]) : [];

  // Remove any corner grids already present to avoid duplicates
  const withoutGrids = stripExistingCornerGrids(s);

  // Decide what to do
  const gridMode = (gridParam || "").toLowerCase(); // air | hyd | none | ""
  if (gridMode === "none") return withoutGrids;

  let injectAir: boolean;
  if (gridMode === "air" || gridMode === "hyd") {
    injectAir = gridMode === "air";
  } else {
    const vt = (vehicleType || "").toLowerCase();
    injectAir = vt === "truck" || vt === "bus" || vt === "trailer";
  }

  const injected = injectAir ? buildAirCornerSection() : buildHydraulicCornerSection();
  // Put the grid first so techs see it immediately
  return [injected, ...withoutGrids];
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function RunTemplateLoader() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();

  const templateId = sp.get("templateId");
  const gridOverride = sp.get("grid"); // 'air' | 'hyd' | 'none' | null

  useEffect(() => {
    (async () => {
      if (!templateId) {
        toast.error("Missing templateId");
        router.replace("/inspections/templates");
        return;
      }

      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        toast.error("Template not found.");
        router.replace("/inspections/templates");
        return;
      }

      const rawSections = (data.sections ?? []) as Section[];
      const title = data.template_name ?? "Inspection";
      const vehicleType = String(data.vehicle_type ?? "");

      // Deterministic corner grid handling (strip existing, then inject based on override or vehicle type)
      const sections = prepareSectionsWithCornerGrid(rawSections, vehicleType, gridOverride);

      // Stage for the generic runtime
      sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
      sessionStorage.setItem("inspection:title", title);
      sessionStorage.setItem("inspection:vehicleType", vehicleType);
      sessionStorage.setItem("inspection:template", "generic");
      sessionStorage.setItem(
        "inspection:params",
        JSON.stringify(Object.fromEntries(sp)),
      );

      // Legacy keys (avoid older flows bouncing)
      sessionStorage.setItem("customInspection:sections", JSON.stringify(sections));
      sessionStorage.setItem("customInspection:title", title);
      sessionStorage.setItem("customInspection:includeOil", JSON.stringify(false));

      // Forward to fill and *force* template=generic so fill never redirects away
      const next = new URLSearchParams(sp.toString());
      next.delete("templateId");
      next.set("template", "generic");
      router.replace(`/inspections/fill?${next.toString()}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  return <div className="p-4 text-white">Preparing inspection…</div>;
}