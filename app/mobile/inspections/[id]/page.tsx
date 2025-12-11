// app/mobile/inspections/[id]/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import toast from "react-hot-toast";

import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

/* ------------------------------------------------------------------ */
/* Regex helpers to detect existing “corner grid” sections             */
/* (copied from /features/inspections/app/inspection/run/page.tsx)    */
/* ------------------------------------------------------------------ */

// LF/RF/LR/RR ...
const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;

// Steer/Drive/Tag/Trailer <N> Left|Right ...
const AIR_ITEM_RE =
  /^(Steer\s*\d*|Drive\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i;

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

function stripExistingCornerGrids(sections: Section[]): Section[] {
  return sections.filter((s) => {
    if (looksLikeCornerTitle(s.title)) return false;

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
  for (const c of corners) {
    for (const m of metrics) {
      items.push({ item: `${c} ${m.label}`, unit: m.unit });
    }
  }
  return { title: "Corner Grid (Hydraulic)", items };
}

/** Default air corner grid: Steer 1 + Drive 1 */
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
/* Deterministic grid selection (same as /inspection/run)             */
/* ------------------------------------------------------------------ */

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
    injectAir = vt === "truck" || vt === "bus" || vt === "trailer";
  }

  const injected = injectAir
    ? buildAirCornerSection()
    : buildHydraulicCornerSection();

  return [injected, ...withoutGrids];
}

/* ------------------------------------------------------------------ */
/* Mobile runner page                                                 */
/* ------------------------------------------------------------------ */

export default function MobileInspectionRunnerPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );

  const lineId = params?.id ? String(params.id) : null;
  const workOrderId = search.get("workOrderId");
  const templateId = search.get("templateId");
  const gridOverride = search.get("grid"); // 'air' | 'hyd' | 'none' | null

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lineId || !templateId) {
      setError("Missing inspection line or template.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("inspection_templates")
          .select("template_name, sections, vehicle_type")
          .eq("id", templateId)
          .maybeSingle();

        if (error || !data) {
          console.error(error);
          setError("Template not found.");
          toast.error("Template not found.");
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

        // Build params object the runtime expects
        const paramsObj: Record<string, string> = {};
        search.forEach((v, k) => {
          paramsObj[k] = v;
        });

        paramsObj.workOrderLineId = lineId;
        if (workOrderId) paramsObj.workOrderId = workOrderId;
        if (templateId) paramsObj.templateId = templateId;
        paramsObj.view = "mobile"; // turn on mobile voice controls

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
            JSON.stringify(paramsObj),
          );

          // legacy/custom keys so older flows still work
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
      } catch (e) {
        console.error(e);
        setError("Failed to prepare inspection.");
        toast.error("Failed to prepare inspection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [lineId, templateId, workOrderId, gridOverride, search, supabase]);

  if (!lineId) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-red-300">
        Missing inspection id.
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-neutral-300">
        Preparing inspection…
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-red-300">
        {error}
      </main>
    );
  }

  // At this point sessionStorage is ready; GenericInspectionScreen
  // will read sections + params and render the full template
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-transparent px-3 py-4 text-white">
      <GenericInspectionScreen />
    </main>
  );
}