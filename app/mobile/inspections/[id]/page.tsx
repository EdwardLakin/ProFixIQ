// app/mobile/inspections/[id]/page.tsx
// app/mobile/inspections/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { toast } from "sonner";

import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";

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
  return (sections ?? []).filter((s) => {
    if (looksLikeCornerTitle(s.title)) return false;

    const items = s.items ?? [];
    const looksHyd = items.some((it) => HYD_ITEM_RE.test(it.item || ""));
    const looksAir = items.some((it) => AIR_ITEM_RE.test(it.item || ""));
    return !(looksHyd || looksAir);
  });
}

/* ------------------------------------------------------------------ */
/* Canonical corner grid builders                                     */
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
/* Deterministic grid selection                                       */
/* ------------------------------------------------------------------ */

function prepareSectionsWithCornerGrid(
  sections: Section[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): Section[] {
  const s = Array.isArray(sections) ? sections : [];

  // If template already has a corner grid title, don’t inject anything.
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
    injectAir =
      vt.includes("truck") ||
      vt.includes("bus") ||
      vt.includes("coach") ||
      vt.includes("trailer") ||
      vt.includes("heavy") ||
      vt.includes("medium-heavy") ||
      vt.includes("air");
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
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const searchKey = search.toString(); // ✅ stable snapshot for deps

  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const lineId = params?.id ? String(params.id) : null;

  // pull values from the stable snapshot
  const { workOrderId, templateId, gridOverride } = useMemo(() => {
    const sp = new URLSearchParams(searchKey);
    return {
      workOrderId: sp.get("workOrderId"),
      templateId: sp.get("templateId"),
      gridOverride: sp.get("grid"), // air | hyd | none | null
    };
  }, [searchKey]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!lineId || !templateId) {
      setError("Missing inspection line or template.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from("inspection_templates")
          .select("template_name, sections, vehicle_type")
          .eq("id", templateId)
          .maybeSingle();

        if (cancelled) return;

        if (qErr || !data) {
          console.error(qErr);
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

        // rebuild params from searchKey (stable)
        const sp = new URLSearchParams(searchKey);
        const paramsObj: Record<string, string> = {};
        sp.forEach((v, k) => {
          paramsObj[k] = v;
        });

        // ✅ Force runtime identity (desktop-aligned)
        paramsObj.mode = "run";
        paramsObj.view = "mobile";

        // ✅ Canonical identifiers used by runtime/persistence
        paramsObj.workOrderLineId = lineId;
        paramsObj.lineId = lineId; // compat for older readers
        if (workOrderId) paramsObj.workOrderId = workOrderId;
        paramsObj.templateId = templateId;
        paramsObj.template = "generic";

        if (typeof window !== "undefined") {
          // ✅ Runtime keys ONLY (desktop-aligned)
          sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
          sessionStorage.setItem("inspection:title", title);
          sessionStorage.setItem("inspection:vehicleType", vehicleType);
          sessionStorage.setItem("inspection:template", "generic");
          sessionStorage.setItem("inspection:params", JSON.stringify(paramsObj));

          // ❌ Kill legacy keys so builder UI can't “win”
          sessionStorage.removeItem("customInspection:sections");
          sessionStorage.removeItem("customInspection:title");
          sessionStorage.removeItem("customInspection:includeOil");
          sessionStorage.removeItem("customInspection:includeBatteryGrid");
          sessionStorage.removeItem("customInspection:gridMode");
        }
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        setError("Failed to prepare inspection.");
        toast.error("Failed to prepare inspection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lineId, templateId, workOrderId, gridOverride, searchKey, supabase]);

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

  return (
    <div className="app-shell flex min-h-screen flex-col text-foreground">
      {/* Mobile header (keeps theme, page not modal) */}
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] text-neutral-100 hover:bg-black/70"
        >
          <span>←</span>
          <span className="uppercase tracking-[0.16em]">Back</span>
        </button>

        <div className="flex-1 truncate px-2 text-center text-[11px] font-medium text-neutral-200">
          Inspection •{" "}
          <span className="font-mono text-neutral-100">
            {lineId.slice(0, 8)}
          </span>
        </div>

        <div className="w-14" />
      </header>

      <main className="mobile-body-gradient flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-4xl text-white">
          <GenericInspectionScreen />
        </div>
      </main>
    </div>
  );
}