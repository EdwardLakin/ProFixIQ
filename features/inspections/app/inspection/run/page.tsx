// features/inspections/app/inspection/run/page.tsx
"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

/* ------------------------------------------------------------------ */
/* Corner-grid + battery helpers (aligned with mobile loader)         */
/* ------------------------------------------------------------------ */

// LF/RF/LR/RR ...
const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;

// Steer/Drive/Tag/Trailer <N> Left|Right ...
const AIR_ITEM_RE =
  /^(Steer\s*\d*|Drive\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i;

/** Titles that clearly mean “this is already a corner grid” */
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

function isBatteryTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  return title.toLowerCase().includes("battery");
}

/** Strip any existing corner-grid style sections (title or pattern based). */
function stripExistingCornerGrids(sections: Section[]): Section[] {
  return sections.filter((s) => {
    if (looksLikeCornerTitle(s.title)) return false;

    const items = s.items ?? [];
    const looksHyd = items.some((it) => HYD_ITEM_RE.test(it.item || ""));
    const looksAir = items.some((it) => AIR_ITEM_RE.test(it.item || ""));
    return !(looksHyd || looksAir);
  });
}

/** Canonical HYD corner grid (LF/RF/LR/RR) */
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

/** Canonical AIR corner grid: Steer 1 + Drive 1 with explicit Inner/Outer where needed */
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

/**
 * Deterministic corner-grid injector:
 * - If template already has a corner-grid-style title, keep as-is.
 * - Else strip pattern-based grids, then inject based on ?grid= or vehicle_type.
 * - For air-brake templates, drop any “Hydraulic Brake” section.
 * - Keep Battery sections immediately under the corner grid.
 */
function prepareSectionsWithCornerGrid(
  sections: Section[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): Section[] {
  const s = Array.isArray(sections) ? sections : [];

  const hasCornerByTitle = s.some((sec) => looksLikeCornerTitle(sec.title));
  if (hasCornerByTitle) return s;

  const withoutGrids = stripExistingCornerGrids(s);
  const gridMode = (gridParam || "").toLowerCase(); // air | hyd | none | ""

  if (gridMode === "none") return withoutGrids;

  let injectAir: boolean;
  if (gridMode === "air" || gridMode === "hyd") {
    injectAir = gridMode === "air";
  } else {
    const vt = (vehicleType || "").toLowerCase();
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

  let pool = withoutGrids;
  if (injectAir) {
    pool = pool.filter(
      (sec) =>
        !sec.title ||
        !sec.title.toLowerCase().includes("hydraulic brake"),
    );
  }

  if (!pool.length) return [cornerSection];

  const batterySections = pool.filter((sec) => isBatteryTitle(sec.title));
  const rest = pool.filter((sec) => !isBatteryTitle(sec.title));

  return [cornerSection, ...batterySections, ...rest];
}

/* ------------------------------------------------------------------ */
/* Loader component                                                   */
/* ------------------------------------------------------------------ */

export default function RunInspectionPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const supabase = createClientComponentClient<DB>();

  useEffect(() => {
    const templateId = sp.get("templateId");
    const gridOverride = sp.get("grid"); // 'air' | 'hyd' | 'none' | null

    if (!templateId) {
      router.replace("/inspections/templates");
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("id, template_name, sections, vehicle_type")
        .eq("id", templateId)
        .maybeSingle<TemplateRow>();

      if (error || !data) {
        // eslint-disable-next-line no-console
        console.error("Failed to load inspection template:", error);
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

      if (typeof window !== "undefined") {
        // Start from current URL params
        const params: Record<string, string> = {};
        sp.forEach((value, key) => {
          params[key] = value;
        });

        // Normalize the core fields we want GenericInspectionScreen to see
        params.templateId = data.id;
        params.template = title;
        params.vehicleType = vehicleType;
        // 🔑 mark this as a *run* session, not a template builder
        params.mode = params.mode || "run";

        sessionStorage.setItem(
          "inspection:sections",
          JSON.stringify(sections),
        );
        sessionStorage.setItem("inspection:title", title);
        sessionStorage.setItem("inspection:vehicleType", vehicleType);
        sessionStorage.setItem("inspection:template", "generic");
        sessionStorage.setItem("inspection:params", JSON.stringify(params));

        // Legacy keys used by older flows
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

      // Forward into the real runtime – preserve WO ids, view=mobile, etc.
      const next = new URLSearchParams(sp.toString());
      next.delete("templateId");
      next.set("template", "generic");
      next.set("mode", "run");

      router.replace(`/inspections/fill?${next.toString()}`);
    })();
  }, [sp, router, supabase]);

  // Loader shell to match the fill loader styling
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