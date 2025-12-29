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

/** Also treat these titles as "this is already a corner grid" */
function looksLikeCornerTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return (
    t.includes("corner grid") ||
    t.includes("tires & brakes") ||
    t.includes("tires and brakes") ||
    t.includes("air brake") ||
    t.includes("hydraulic brake")
  );
}

/** Very simple battery detector */
function isBatteryTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  return title.toLowerCase().includes("battery");
}

/** Remove any section that appears to be a corner grid to prevent duplicates. */
function stripExistingCornerGrids(sections: Section[]): Section[] {
  return sections.filter((s) => {
    // if the title already says it's a corner / tires & brakes, we consider it a grid
    if (looksLikeCornerTitle(s.title)) return false;

    const items = s.items ?? [];
    const looksHyd = items.some((it) => HYD_ITEM_RE.test(it.item || ""));
    const looksAir = items.some((it) => AIR_ITEM_RE.test(it.item || ""));
    return !(looksHyd || looksAir);
  });
}

/* ------------------------------------------------------------------ */
/* Canonical corner grid builders (labels match CornerGrid/AirGrid)   */
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
  for (const c of corners) {
    for (const m of metrics) {
      items.push({ item: `${c} ${m.label}`, unit: m.unit });
    }
  }
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
/* Deterministic grid selection (URL override > vehicle_type)         */
/* ------------------------------------------------------------------ */

/**
 * Behavior:
 * 1. If template already has a "corner-y" title -> return sections untouched.
 * 2. Else strip real corner-grid-looking sections, then inject based on:
 *    - ?grid=air|hyd|none
 *    - else vehicleType (heavy/commercial => air)
 * 3. For air-brake templates, strip any "Hydraulic Brake" sections.
 * 4. Promote any Battery sections to immediately follow the corner grid.
 */
function prepareSectionsWithCornerGrid(
  sections: Section[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): Section[] {
  const s = Array.isArray(sections) ? sections : [];

  // 1) If user already has a section whose TITLE looks like a corner grid, just return it as-is.
  const hasCornerByTitle = s.some((sec) => looksLikeCornerTitle(sec.title));
  if (hasCornerByTitle) {
    return s;
  }

  // 2) Otherwise, remove item-pattern corner grids so we don't end up with 2
  const withoutGrids = stripExistingCornerGrids(s);

  // 3) Decide what to inject
  const gridMode = (gridParam || "").toLowerCase(); // air | hyd | none | ""

  if (gridMode === "none") return withoutGrids;

  let injectAir: boolean;
  if (gridMode === "air" || gridMode === "hyd") {
    // URL override wins: ?grid=air or ?grid=hyd
    injectAir = gridMode === "air";
  } else {
    const vt = (vehicleType || "").toLowerCase();

    // Anything clearly heavy / commercial => air brakes
    const isAirByVehicle =
      vt.includes("truck") ||
      vt.includes("bus") ||
      vt.includes("coach") ||
      vt.includes("trailer") ||
      vt.includes("heavy") ||
      vt.includes("medium-heavy") ||
      vt.includes("air");

    injectAir = isAirByVehicle;
  }

  const cornerSection = injectAir
    ? buildAirCornerSection()
    : buildHydraulicCornerSection();

  // 4) For air-brake templates, strip any Hydraulic Brake section
  let pool = withoutGrids;
  if (injectAir) {
    pool = pool.filter(
      (sec) =>
        !sec.title ||
        !sec.title.toLowerCase().includes("hydraulic brake"),
    );
  }

  if (!pool.length) {
    return [cornerSection];
  }

  // 5) Promote any Battery sections to live directly under the corner grid
  const batterySections = pool.filter((sec) => isBatteryTitle(sec.title));
  const rest = pool.filter((sec) => !isBatteryTitle(sec.title));

  return [cornerSection, ...batterySections, ...rest];
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

      const sections = prepareSectionsWithCornerGrid(
        rawSections,
        vehicleType,
        gridOverride,
      );

      // Stage for the generic runtime
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "inspection:sections",
          JSON.stringify(sections),
        );
        sessionStorage.setItem("inspection:title", title);
        sessionStorage.setItem("inspection:vehicleType", vehicleType);
        sessionStorage.setItem("inspection:template", "generic");
        sessionStorage.setItem(
          "inspection:params",
          JSON.stringify(Object.fromEntries(sp)),
        );

        // Legacy keys, still used by some flows
        sessionStorage.setItem(
          "customInspection:sections",
          JSON.stringify(sections),
        );
        sessionStorage.setItem("customInspection:title", title);
        sessionStorage.setItem(
          "customInspection:includeOil",
          JSON.stringify(false),
        );
      }

      // Forward to fill and *force* template=generic
      const next = new URLSearchParams(sp.toString());
      next.delete("templateId");
      next.set("template", "generic");
      router.replace(`/inspections/fill?${next.toString()}`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Match the glass / metallic theme from fill page
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-3 py-4 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl px-4 py-3 text-sm text-muted-foreground">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/80 px-4 py-3 text-sm">
          Preparing inspection…
        </div>
      </div>
    </div>
  );
}