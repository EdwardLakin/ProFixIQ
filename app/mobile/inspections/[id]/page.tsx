"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import GenericInspectionScreen from "@/features/inspections/screens/GenericInspectionScreen";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type SectionItem = { item: string; unit?: string | null };
type Section = { title: string; items: SectionItem[] };

const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;
const AIR_ITEM_RE =
  /^(Steer\s*\d*|Drive\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i;

function looksLikeCornerTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const value = title.toLowerCase();
  return (
    value.includes("corner grid") ||
    value.includes("tires & brakes") ||
    value.includes("tires and brakes") ||
    value.includes("air brake") ||
    value.includes("hydraulic brake")
  );
}

function stripExistingCornerGrids(sections: Section[]): Section[] {
  return (sections ?? []).filter((section) => {
    if (looksLikeCornerTitle(section.title)) return false;
    const items = section.items ?? [];
    const looksHydraulic = items.some((item) =>
      HYD_ITEM_RE.test(item.item || ""),
    );
    const looksAir = items.some((item) => AIR_ITEM_RE.test(item.item || ""));
    return !(looksHydraulic || looksAir);
  });
}

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
  const items: SectionItem[] = [];
  for (const corner of ["LF", "RF", "LR", "RR"]) {
    for (const metric of metrics) {
      items.push({
        item: `${corner} ${metric.label}`,
        unit: metric.unit,
      });
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

function prepareSectionsWithCornerGrid(
  sections: Section[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): Section[] {
  const source = Array.isArray(sections) ? sections : [];
  if (source.some((section) => looksLikeCornerTitle(section.title))) {
    return source;
  }

  const withoutGrids = stripExistingCornerGrids(source);
  const gridMode = (gridParam || "").toLowerCase();
  if (gridMode === "none") return withoutGrids;

  const injectAir =
    gridMode === "air" ||
    (gridMode !== "hyd" &&
      ["truck", "bus", "coach", "trailer", "heavy", "medium-heavy", "air"].some(
        (token) => (vehicleType || "").toLowerCase().includes(token),
      ));

  return [
    injectAir ? buildAirCornerSection() : buildHydraulicCornerSection(),
    ...withoutGrids,
  ];
}

export default function MobileInspectionRunnerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const searchKey = search.toString();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const lineId = params?.id ? String(params.id) : null;

  const { workOrderId, templateId, gridOverride } = useMemo(() => {
    const values = new URLSearchParams(searchKey);
    return {
      workOrderId: values.get("workOrderId"),
      templateId: values.get("templateId"),
      gridOverride: values.get("grid"),
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

    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("inspection_templates")
          .select("template_name, sections, vehicle_type")
          .eq("id", templateId)
          .maybeSingle();
        if (cancelled) return;
        if (queryError || !data) {
          // eslint-disable-next-line no-console
          console.error(queryError);
          setError("Template not found.");
          toast.error("Template not found.");
          return;
        }

        const sections = prepareSectionsWithCornerGrid(
          (data.sections ?? []) as Section[],
          String(data.vehicle_type ?? ""),
          gridOverride,
        );
        const runtimeParams: Record<string, string> = {};
        new URLSearchParams(searchKey).forEach((value, key) => {
          runtimeParams[key] = value;
        });
        runtimeParams.mode = "run";
        runtimeParams.view = "mobile";
        runtimeParams.workOrderLineId = lineId;
        runtimeParams.lineId = lineId;
        if (workOrderId) runtimeParams.workOrderId = workOrderId;
        runtimeParams.templateId = templateId;
        runtimeParams.template = "generic";

        sessionStorage.setItem("inspection:sections", JSON.stringify(sections));
        sessionStorage.setItem(
          "inspection:title",
          data.template_name ?? "Inspection",
        );
        sessionStorage.setItem(
          "inspection:vehicleType",
          String(data.vehicle_type ?? ""),
        );
        sessionStorage.setItem("inspection:template", "generic");
        sessionStorage.setItem(
          "inspection:params",
          JSON.stringify(runtimeParams),
        );
        sessionStorage.removeItem("customInspection:sections");
        sessionStorage.removeItem("customInspection:title");
        sessionStorage.removeItem("customInspection:includeOil");
        sessionStorage.removeItem("customInspection:includeBatteryGrid");
        sessionStorage.removeItem("customInspection:gridMode");
      } catch (caught) {
        // eslint-disable-next-line no-console
        console.error(caught);
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
  }, [gridOverride, lineId, searchKey, supabase, templateId, workOrderId]);

  if (!lineId) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-red-300">
        Missing inspection id.
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
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

  const backHref = workOrderId
    ? `/mobile/work-orders/${workOrderId}?focus=${encodeURIComponent(lineId)}`
    : "/mobile/inspections";

  return (
    <div className="app-shell flex min-h-screen flex-col text-foreground">
      <header className="metal-bar sticky top-0 z-40 flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[11px] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
        >
          <span>←</span>
          <span className="uppercase tracking-[0.16em]">
            {workOrderId ? "Job" : "Inspections"}
          </span>
        </button>

        <div className="flex-1 truncate px-2 text-center text-[11px] font-medium text-[color:var(--theme-text-primary)]">
          Inspection •{" "}
          <span className="font-mono text-[color:var(--theme-text-primary)]">
            {lineId.slice(0, 8)}
          </span>
        </div>
        <div className="w-14" />
      </header>

      <main className="mobile-body-gradient flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-4xl text-[color:var(--theme-text-primary)]">
          <GenericInspectionScreen />
        </div>
      </main>
    </div>
  );
}
