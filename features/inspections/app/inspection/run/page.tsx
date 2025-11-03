"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import toast from "react-hot-toast";

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

export default function RunTemplateLoader() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = createClientComponentClient<Database>();
  const templateId = sp.get("templateId");

  /** Detect LF/RF/LR/RR labels (hydraulic corner grid) */
  const hasHydraulicCorners = (sections: Section[]) =>
    sections.some((s) =>
      (s.items ?? []).some((it) => /^(LF|RF|LR|RR)\s+/i.test(it.item || "")),
    );

  /** Detect Steer/Drive/Tag/Trailer N Left/Right ... (air corner grid) */
  const hasAirCorners = (sections: Section[]) =>
    sections.some((s) =>
      (s.items ?? []).some((it) =>
        /^(Steer\s*\d*|Drive\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i.test(
          it.item || "",
        ),
      ),
    );

  /** Default hydraulic corner grid (LF/RF & LR/RR) */
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
      for (const m of metrics) items.push({ item: `${c} ${m.label}`, unit: m.unit });
    }
    return { title: "Corner Grid (Hydraulic)", items };
  }

  /** Default air corner grid: Steer 1 + Drive 1 */
  function buildAirCornerSection(): Section {
    const steerItems: SectionItem[] = [
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

    // Drive axle: include explicit Inner/Outer tread; AirCornerGrid will not double-expand.
    const driveItems: SectionItem[] = [
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

    return { title: "Corner Grid (Air)", items: [...steerItems, ...driveItems] };
  }

  /** Ensure at least one corner grid exists; append a default if missing */
  function ensureCornerGrid(sections: Section[], vehicleType?: string | null): Section[] {
    const s = Array.isArray(sections) ? (sections as Section[]) : [];
    if (hasHydraulicCorners(s) || hasAirCorners(s)) return s;

    const vt = (vehicleType || "").toLowerCase();
    const isAir = vt === "truck" || vt === "bus" || vt === "trailer";
    const injected = isAir ? buildAirCornerSection() : buildHydraulicCornerSection();

    // Place the grid first so techs see it immediately
    return [injected, ...s];
  }

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

      // Guarantee a corner grid exists
      const sections = ensureCornerGrid(rawSections, vehicleType);

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
