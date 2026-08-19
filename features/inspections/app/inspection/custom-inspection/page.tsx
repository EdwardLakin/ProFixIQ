// /app/inspections/custom-inspection/page.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  FileStack,
  ListChecks,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import {
  buildFromMaster,
  masterInspectionList,
  type BrakeSystem,
  type CvipGroup,
  type VehicleType,
} from "@inspections/lib/inspection/masterInspectionList";
import {
  getInspectionBuilderNavigation,
  type InspectionBuilderSurface,
} from "@/features/inspections/lib/inspectionBuilderNavigation";
import { buttonClasses } from "@/features/shared/components/ui/Button";

type DutyClass = "light" | "medium" | "heavy";
type GridMode = "hyd" | "air" | "none";
type EngineType = "gas" | "diesel";
type BuildMethod = "template" | "prompt" | "manual";

/** ✅ Upgraded item shape so we don't lose CVIP/spec metadata */
type SectionItem = {
  item?: string;
  name?: string;
  unit?: string | null;
  specCode?: string | null;
  cvipCode?: string | null;
  cvipGroups?: CvipGroup[]; // optional if present in master
};

type Section = {
  title: string;
  items: SectionItem[];
};

/* ------------------------------------------------------------------ */
/* Corner-grid detection + builders (FINAL / CANONICAL)               */
/* ------------------------------------------------------------------ */

const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;
const AIR_ITEM_RE = /^(Steer|Drive|Tag|Trailer)\s*\d*\s+(Left|Right)\s+/i;

function looksLikeCornerTitle(title?: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return t.includes("corner grid") || t.includes("brake corner");
}

/* ---------------- HYDRAULIC BRAKE CORNER GRID ---------------- */

function buildHydraulicCornerSection(): Section {
  const corners = ["LF", "RF", "LR", "RR"];
  const metrics = [
    { label: "Brake Pad Thickness", unit: "mm" },
    { label: "Rotor Thickness", unit: "mm" },
  ];

  const items = corners.flatMap((c) =>
    metrics.map((m) => ({
      item: `${c} ${m.label}`,
      unit: m.unit,
    })),
  );

  return {
    title: "Corner Grid – Hydraulic Brakes",
    items,
  };
}

/* ---------------- AIR BRAKE CORNER GRID ---------------- */

function buildAirCornerSection(): Section {
  const axles = ["Steer 1", "Drive 1"];
  const sides = ["Left", "Right"];

  const metrics = [
    { label: "Brake Pad / Shoe Thickness", unit: "mm" },
    { label: "Brake Drum / Rotor Thickness", unit: "mm" },
    { label: "Push Rod Travel", unit: "in" },
  ];

  const items: Section["items"] = [];

  for (const axle of axles) {
    for (const side of sides) {
      for (const m of metrics) {
        items.push({
          item: `${axle} ${side} ${m.label}`,
          unit: m.unit,
        });
      }
    }
  }

  return {
    title: "Corner Grid – Air Brakes",
    items,
  };
}

/* ------------------------------------------------------------------ */
/* TIRE GRIDS                                                         */
/* ------------------------------------------------------------------ */

function hasTireGrid(sections: Section[]): boolean {
  return sections.some((s) =>
    (s.title || "").toLowerCase().includes("tire grid"),
  );
}

function buildAirTireGrid(): Section {
  const axles = ["Steer 1", "Drive 1"];
  const sides = ["Left", "Right"];
  const items: Section["items"] = [];

  for (const axle of axles) {
    const isDual =
      axle.toLowerCase().startsWith("drive") ||
      axle.toLowerCase().startsWith("rear") ||
      axle.toLowerCase().startsWith("tag") ||
      axle.toLowerCase().startsWith("trailer");

    items.push({ item: `${axle} Tire Status`, unit: null });

    for (const side of sides) {
      if (!isDual) {
        items.push({ item: `${axle} ${side} Tire Pressure`, unit: "psi" });
        items.push({ item: `${axle} ${side} Tread Depth`, unit: "mm" });
      } else {
        items.push({
          item: `${axle} ${side} Tire Pressure (Outer)`,
          unit: "psi",
        });
        items.push({
          item: `${axle} ${side} Tire Pressure (Inner)`,
          unit: "psi",
        });
        items.push({ item: `${axle} ${side} Tread Depth (Outer)`, unit: "mm" });
        items.push({ item: `${axle} ${side} Tread Depth (Inner)`, unit: "mm" });
      }
    }
  }

  return {
    title: "Tire Grid – Air Brake",
    items,
  };
}

function buildHydraulicTireGrid(): Section {
  const front = ["LF", "RF"] as const;
  const rear = ["LR", "RR"] as const;

  const items: Section["items"] = [];

  items.push({ item: "LF Tire Status", unit: null });
  items.push({ item: "RF Tire Status", unit: null });
  items.push({ item: "LR Tire Status", unit: null });
  items.push({ item: "RR Tire Status", unit: null });

  for (const c of front) {
    items.push({ item: `${c} Tire Pressure`, unit: "psi" });
    items.push({ item: `${c} Tread Depth (Outer)`, unit: "mm" });
  }

  for (const c of rear) {
    items.push({ item: `${c} Tire Pressure (Outer)`, unit: "psi" });
    items.push({ item: `${c} Tire Pressure (Inner)`, unit: "psi" });
    items.push({ item: `${c} Tread Depth (Outer)`, unit: "mm" });
    items.push({ item: `${c} Tread Depth (Inner)`, unit: "mm" });
  }

  return {
    title: "Tire Grid – Hydraulic",
    items,
  };
}

/* ------------------------------------------------------------------ */
/* BATTERY GRID                                                       */
/* ------------------------------------------------------------------ */

function hasBatteryGrid(sections: Section[]): boolean {
  return sections.some((s) =>
    (s.title || "").toLowerCase().includes("battery grid"),
  );
}

function buildBatteryGrid(count = 1): Section {
  const batteries = Array.from(
    { length: Math.min(5, Math.max(1, count)) },
    (_, i) => `Battery ${i + 1}`,
  );

  const metrics = [
    { label: "Rated CCA", unit: "CCA" },
    { label: "Tested CCA", unit: "CCA" },
  ];

  const items = batteries.flatMap((b) =>
    metrics.map((m) => ({
      item: `${b} ${m.label}`,
      unit: m.unit,
    })),
  );

  return {
    title: "Battery Grid",
    items,
  };
}

/* ------------------------------------------------------------------ */
/* SECTION UTILITIES                                                  */
/* ------------------------------------------------------------------ */

function normalizeTitle(t: string) {
  return (t || "").trim().toLowerCase();
}
function normalizeItem(i: string) {
  return (i || "").trim().toLowerCase();
}
function toLabel(raw: { item?: string; name?: string }) {
  return (raw.item ?? raw.name ?? "").trim();
}

function mergeSections(a: Section[], b: Section[]): Section[] {
  const out: Record<
    string,
    {
      title: string;
      items: {
        item: string;
        unit?: string | null;
        specCode?: string | null;
        cvipCode?: string | null;
        cvipGroups?: CvipGroup[];
      }[];
    }
  > = {};

  const addList = (list: Section[]) => {
    for (const sec of list || []) {
      const sectionTitle = sec?.title ?? "";
      const key = normalizeTitle(sectionTitle);
      if (!key) continue;
      if (!out[key]) out[key] = { title: sectionTitle, items: [] };

      const seen = new Set(out[key].items.map((i) => normalizeItem(i.item)));
      for (const raw of sec.items || []) {
        const label = toLabel(raw);
        if (!label) continue;
        const lk = normalizeItem(label);
        if (seen.has(lk)) continue;

        out[key].items.push({
          item: label,
          unit: raw.unit ?? null,
          specCode: raw.specCode ?? null,
          cvipCode: raw.cvipCode ?? null,
          cvipGroups: raw.cvipGroups,
        });

        seen.add(lk);
      }
    }
  };

  addList(a);
  addList(b);

  return Object.values(out).filter((s) => (s.items?.length ?? 0) > 0);
}

/* ------------------------------------------------------------------ */
/* FINAL SECTION ASSEMBLER                                            */
/* ------------------------------------------------------------------ */

function prepareSections(
  base: Section[],
  gridMode: GridMode,
  includeTires: boolean,
  includeBattery: boolean,
  batteryCount: number,
): Section[] {
  let sections = (base || []).filter((s) => {
    const title = s?.title ?? "";
    if (looksLikeCornerTitle(title)) return false;

    const items = s.items ?? [];
    const looksHyd = items.some((it) =>
      HYD_ITEM_RE.test((it.item || it.name || "").trim()),
    );
    const looksAir = items.some((it) =>
      AIR_ITEM_RE.test((it.item || it.name || "").trim()),
    );
    return !(looksHyd || looksAir);
  });

  if (gridMode === "air") sections = [buildAirCornerSection(), ...sections];
  if (gridMode === "hyd")
    sections = [buildHydraulicCornerSection(), ...sections];

  if (includeTires && !hasTireGrid(sections)) {
    const tire =
      gridMode === "air" ? buildAirTireGrid() : buildHydraulicTireGrid();
    const insertAt = sections.length > 0 ? 1 : 0;
    sections = [
      ...sections.slice(0, insertAt),
      tire,
      ...sections.slice(insertAt),
    ];
  }

  if (includeBattery && !hasBatteryGrid(sections)) {
    const insertAt = sections.length >= 2 ? 2 : sections.length;
    sections = [
      ...sections.slice(0, insertAt),
      buildBatteryGrid(batteryCount),
      ...sections.slice(insertAt),
    ];
  }

  return sections;
}

/* ------------------------------------------------------------------ */
/* Prompt triggers                                                    */
/* ------------------------------------------------------------------ */

type PromptInferred = {
  dutyClass?: DutyClass;
  gridMode?: GridMode;
  vehicleType?: VehicleType;
  brakeSystem?: BrakeSystem;
  includeTireGrid?: boolean;
  includeBatteryGrid?: boolean;
  includeGreaseChassis?: boolean;
  includeOil?: boolean;
  oilEngineType?: EngineType;
  targetCount?: number;
  titleHint?: string;
};

function parsePromptTriggers(prompt: string): PromptInferred {
  const p = (prompt || "").toLowerCase();

  const inferred: PromptInferred = {};

  // --- count: "30 point", "60-point", "80 pt"
  const m = p.match(/(\d{2,3})\s*(point|pt)\b/i);
  if (m?.[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) inferred.targetCount = n;
  }

  // --- duty class words
  if (/\blight\s*duty\b|\bautomotive\b|\bpassenger\b|\bsuv\b|\bcar\b/.test(p)) {
    inferred.dutyClass = "light";
    inferred.vehicleType = "car";
    inferred.brakeSystem = "hyd_brake";
    inferred.gridMode = "hyd";
  }
  if (/\bmedium\s*duty\b|\bclass\s*5\b|\bclass\s*6\b/.test(p)) {
    inferred.dutyClass = "medium";
  }
  if (
    /\bheavy\s*duty\b|\bclass\s*7\b|\bclass\s*8\b|\btractor\b|\bsemi\b/.test(p)
  ) {
    inferred.dutyClass = "heavy";
    inferred.vehicleType = inferred.vehicleType ?? "truck";
  }

  // --- vehicle type hints
  if (/\btruck\b|\btractor\b|\bhighway\b|\bsemi\b/.test(p))
    inferred.vehicleType = "truck";
  if (/\btrailer\b/.test(p)) inferred.vehicleType = "trailer";
  if (/\bbus\b|\bcoach\b|\bmotorcoach\b/.test(p)) inferred.vehicleType = "bus";

  // --- brake system hints
  if (
    /\bair\s*brake\b|\bairbrake\b|\bpush\s*rod\b|\bslack\s*adjuster\b/.test(p)
  ) {
    inferred.brakeSystem = "air_brake";
    inferred.gridMode = inferred.gridMode ?? "air";
  }
  if (/\bhydraulic\b|\bhyd\b|\bpassenger\b/.test(p)) {
    inferred.brakeSystem = inferred.brakeSystem ?? "hyd_brake";
    inferred.gridMode = inferred.gridMode ?? "hyd";
  }

  // --- grids/toggles
  if (/\btire\s*grid\b|\btires?\b.*\bpressure\b|\btread\b/.test(p))
    inferred.includeTireGrid = true;
  if (/\bbattery\s*grid\b|\bbatter(y|ies)\b|\bcca\b/.test(p))
    inferred.includeBatteryGrid = true;
  if (/\bgrease\b|\bchassis\b/.test(p)) inferred.includeGreaseChassis = true;

  // --- oil hints
  if (/\boil\s*change\b|\boil\b.*\bfilter\b/.test(p))
    inferred.includeOil = true;
  if (/\bdiesel\b/.test(p)) inferred.oilEngineType = "diesel";
  if (/\bgas\b|\bgasoline\b/.test(p)) inferred.oilEngineType = "gas";

  // --- explicit corner grid disable
  if (
    /\bno\s*corner\s*grid\b|\bwithout\s*corner\s*grid\b|\bno\s*grid\b/.test(p)
  ) {
    inferred.gridMode = "none";
  }

  // --- title hint (very light-touch)
  if (/\bcvip\b/.test(p)) inferred.titleHint = "CVIP Inspection";
  if (/\bpre\s*trip\b|\bpretrip\b/.test(p))
    inferred.titleHint = "Pre-Trip Inspection";
  if (/\bbrake\b/.test(p) && /\binspect\b|\binspection\b/.test(p))
    inferred.titleHint = "Brake Inspection";

  return inferred;
}

/* ------------------------------------------------------------------ */

type AiPresetKey = "cvip_air" | "cvip_hyd" | "cvip_bus_air";

const CVIP_PRESETS: Record<AiPresetKey, { label: string; prompt: string }> = {
  cvip_air: {
    label: "CVIP Air (Truck/Tractor)",
    prompt:
      "Generate an Alberta CVIP inspection template for a truck/tractor with AIR BRAKES. Output: sections [{title, items:[{item, unit?}]}]. Include tire grid + battery grid if relevant. 120-point.",
  },
  cvip_hyd: {
    label: "CVIP Hydraulic (Truck/Tractor)",
    prompt:
      "Generate an Alberta CVIP inspection template for a truck/tractor with HYDRAULIC BRAKES. Output: sections [{title, items:[{item, unit?}]}]. Include tire grid + battery grid if relevant. 120-point.",
  },
  cvip_bus_air: {
    label: "CVIP Bus (Air)",
    prompt:
      "Generate an Alberta CVIP inspection template for a BUS/MOTORCOACH with AIR BRAKES. Output: sections [{title, items:[{item, unit?}]}]. Include tire grid + battery grid if relevant. 120-point.",
  },
};

function inferCvipGroup(v: VehicleType, b: BrakeSystem): CvipGroup | undefined {
  if (v === "truck")
    return b === "air_brake" ? "cvip_truck_air" : "cvip_truck_hyd";
  if (v === "trailer")
    return b === "air_brake" ? "cvip_trailer_air" : "cvip_trailer_hyd";
  if (v === "bus") return b === "air_brake" ? "cvip_bus_air" : "cvip_bus_hyd";
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Small UI helpers                                                   */
/* ------------------------------------------------------------------ */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function selectionButtonClasses(active: boolean) {
  return buttonClasses({
    variant: active ? "default" : "secondary",
    size: "sm",
    className: cx(
      "min-h-11 w-full justify-between px-3 text-left text-xs",
      active && "bg-[color:var(--brand-primary)]",
    ),
  });
}

function compactGridLabel(mode: GridMode) {
  if (mode === "air") return "Air";
  if (mode === "hyd") return "Hydraulic";
  return "None";
}

function cleanNumericString(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  return cleaned ? cleaned.replace(/^0+(?=\d)/, "") : "";
}

export default function CustomBuilderPage({
  surface = "shop",
}: {
  surface?: InspectionBuilderSurface;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const navigation = getInspectionBuilderNavigation(surface);

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [dutyClass, setDutyClass] = useState<DutyClass>("heavy");
  const [laborHours, setLaborHours] = useState<string>("");

  const [gridMode, setGridMode] = useState<GridMode>(
    dutyClass === "heavy" ? "air" : "hyd",
  );
  const [gridTouched, setGridTouched] = useState(false);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [includeOil, setIncludeOil] = useState(true);
  const [oilEngineType, setOilEngineType] = useState<EngineType>("diesel");

  const [includeBatteryGrid, setIncludeBatteryGrid] = useState(false);
  const [batteryCount] = useState<number>(1);

  const [includeTireGrid, setIncludeTireGrid] = useState(false);
  const [includeGreaseChassis, setIncludeGreaseChassis] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPreset, setAiPreset] = useState<AiPresetKey | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [vehicleType, setVehicleType] = useState<VehicleType>(
    dutyClass === "light" ? "car" : "truck",
  );
  const [brakeSystem, setBrakeSystem] = useState<BrakeSystem>(
    dutyClass === "heavy" ? "air_brake" : "hyd_brake",
  );
  const [targetCount, setTargetCount] = useState<number>(80);

  const [quickTouched, setQuickTouched] = useState(false);
  const [buildMethod, setBuildMethod] = useState<BuildMethod>("template");
  const [activeSectionTitle, setActiveSectionTitle] = useState(
    masterInspectionList[0]?.title ?? "",
  );
  const [sectionQuery, setSectionQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");

  const triggerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (gridTouched) return;
    setGridMode(dutyClass === "heavy" ? "air" : "hyd");
  }, [dutyClass, gridTouched]);

  useEffect(() => {
    if (quickTouched) return;
    setVehicleType(dutyClass === "light" ? "car" : "truck");
    setBrakeSystem(dutyClass === "heavy" ? "air_brake" : "hyd_brake");
  }, [dutyClass, quickTouched]);

  const cvipGroup = useMemo(
    () => inferCvipGroup(vehicleType, brakeSystem),
    [vehicleType, brakeSystem],
  );

  const dutyLabel =
    dutyClass === "light"
      ? "Light duty"
      : dutyClass === "medium"
        ? "Medium duty"
        : "Heavy duty";

  const totalSelected = useMemo(
    () =>
      Object.values(selections).reduce(
        (sum, arr) => sum + (arr?.length ?? 0),
        0,
      ),
    [selections],
  );

  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      if (cur.has(item)) cur.delete(item);
      else cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  function selectAllInSection(
    sectionTitle: string,
    items: Array<{ item: string }>,
  ) {
    setSelections((prev) => ({
      ...prev,
      [sectionTitle]: items.map((i) => i.item),
    }));
  }
  function clearSection(sectionTitle: string) {
    setSelections((prev) => ({ ...prev, [sectionTitle]: [] }));
  }

  function buildOilSection(engine: EngineType): Section {
    return {
      title: engine === "diesel" ? "Oil Change (Diesel)" : "Oil Change (Gas)",
      items: [
        { item: "Drain and fill engine oil" },
        { item: "Replace oil filter" },
      ],
    };
  }

  function buildGreaseChassisSection(): Section {
    return { title: "Grease Chassis", items: [{ item: "Grease chassis" }] };
  }

  function goToRunWithSections(
    sections: Section[] | unknown,
    tplTitle: string,
  ) {
    const base = Array.isArray(sections) ? (sections as Section[]) : [];

    let finalSections = prepareSections(
      base,
      gridMode,
      includeTireGrid,
      includeBatteryGrid,
      batteryCount,
    );

    if (
      includeGreaseChassis &&
      !finalSections.some((s) => normalizeTitle(s.title) === "grease chassis")
    ) {
      finalSections = [...finalSections, buildGreaseChassisSection()];
    }

    sessionStorage.setItem(
      "inspection:sections",
      JSON.stringify(finalSections),
    );
    sessionStorage.setItem("inspection:title", tplTitle);
    sessionStorage.setItem("inspection:template", "generic");

    const qs = new URLSearchParams(sp.toString());
    qs.set("template", "generic");
    qs.set("title", tplTitle);
    qs.set("mode", "run");
    qs.set("grid", gridMode);
    qs.set("dutyClass", dutyClass);

    if (includeTireGrid) qs.set("tireGrid", "1");
    if (includeBatteryGrid) {
      qs.set("batteryGrid", "1");
      qs.set("batteryCount", String(batteryCount));
    }
    if (includeGreaseChassis) qs.set("greaseChassis", "1");
    if (includeOil) qs.set("oil", oilEngineType);
    if (laborHours.trim()) qs.set("hours", laborHours.trim());

    sessionStorage.removeItem("customInspection:sections");
    sessionStorage.removeItem("customInspection:title");
    sessionStorage.removeItem("customInspection:gridMode");
    sessionStorage.removeItem("customInspection:includeOil");
    sessionStorage.removeItem("customInspection:includeBatteryGrid");

    sessionStorage.setItem(
      "inspection:params",
      JSON.stringify({
        template: "generic",
        mode: "run",
        grid: gridMode,
        dutyClass,
        title: tplTitle,
        tireGrid: includeTireGrid,
        batteryGrid: includeBatteryGrid,
        batteryCount: includeBatteryGrid ? batteryCount : null,
        greaseChassis: includeGreaseChassis,
        oil: includeOil ? oilEngineType : null,
        laborHours: laborHours.trim() || null,
        vehicleType,
        brakeSystem,
        cvipGroup: cvipGroup ?? null,
        targetCount,
      }),
    );

    router.push(navigation.reviewHref(qs));
  }

  function startQuickFromMaster() {
    const built = buildFromMaster({
      vehicleType,
      brakeSystem,
      dutyClass,
      targetCount,
      cvipGroup,
    }) as unknown as Section[];

    const withOil =
      includeOil &&
      !built.some((s) => normalizeTitle(s.title).startsWith("oil change"))
        ? [...built, buildOilSection(oilEngineType)]
        : built;

    goToRunWithSections(withOil, title || "Custom Inspection");
  }

  function startManual() {
    const built = buildInspectionFromSelections({
      selections,
      extraServiceItems: [],
    }) as unknown as Section[];

    const withOil =
      includeOil &&
      !built.some((s) => normalizeTitle(s.title).startsWith("oil change"))
        ? [...built, buildOilSection(oilEngineType)]
        : built;

    goToRunWithSections(withOil, title);
  }

  function applyAiPreset(key: AiPresetKey) {
    setAiPreset(key);
    const p = CVIP_PRESETS[key].prompt;
    setAiPrompt(p);
    applyPromptToControls(p);
  }

  function applyPromptToControls(prompt: string) {
    const inferred = parsePromptTriggers(prompt);

    if (inferred.dutyClass) setDutyClass(inferred.dutyClass);

    if (!gridTouched && inferred.gridMode) setGridMode(inferred.gridMode);

    if (!quickTouched) {
      if (inferred.vehicleType) setVehicleType(inferred.vehicleType);
      if (inferred.brakeSystem) setBrakeSystem(inferred.brakeSystem);
    }

    if (typeof inferred.targetCount === "number" && inferred.targetCount > 0) {
      setTargetCount(inferred.targetCount);
    }

    if (typeof inferred.includeTireGrid === "boolean")
      setIncludeTireGrid(inferred.includeTireGrid);
    if (typeof inferred.includeBatteryGrid === "boolean")
      setIncludeBatteryGrid(inferred.includeBatteryGrid);
    if (typeof inferred.includeGreaseChassis === "boolean")
      setIncludeGreaseChassis(inferred.includeGreaseChassis);

    if (typeof inferred.includeOil === "boolean")
      setIncludeOil(inferred.includeOil);
    if (inferred.oilEngineType) setOilEngineType(inferred.oilEngineType);

    if (
      inferred.titleHint &&
      (!title || title.toLowerCase().includes("custom inspection"))
    ) {
      setTitle(inferred.titleHint);
    }
  }

  function scheduleAutoTriggerApply(nextPrompt: string) {
    if (triggerTimerRef.current) window.clearTimeout(triggerTimerRef.current);
    triggerTimerRef.current = window.setTimeout(() => {
      if (nextPrompt.trim()) applyPromptToControls(nextPrompt);
    }, 350);
  }

  async function buildFromPrompt() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const inferred = parsePromptTriggers(aiPrompt);
      applyPromptToControls(aiPrompt);

      const requestDutyClass = inferred.dutyClass ?? dutyClass;
      const requestVehicleType = inferred.vehicleType ?? vehicleType;
      const requestBrakeSystem = inferred.brakeSystem ?? brakeSystem;
      const requestTargetCount = inferred.targetCount ?? targetCount;

      const res = await fetch("/api/inspections/build-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          dutyClass: requestDutyClass,
          vehicleType: requestVehicleType,
          brakeSystem: requestBrakeSystem,
          targetCount: requestTargetCount,
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Generate failed (${res.status})`);
      }

      const payload = (await res.json()) as { sections: Section[] };
      const aiSections = Array.isArray(payload.sections)
        ? payload.sections
        : [];

      const manualBuilt = buildInspectionFromSelections({
        selections,
        extraServiceItems: [],
      }) as unknown as Section[];

      const aiHasOil = aiSections.some((s) =>
        normalizeTitle(s.title).startsWith("oil change"),
      );
      const manualHasOil = manualBuilt.some((s) =>
        normalizeTitle(s.title).startsWith("oil change"),
      );

      const base =
        includeOil && !aiHasOil && !manualHasOil
          ? [...aiSections, buildOilSection(oilEngineType)]
          : aiSections;

      const merged = mergeSections(base, manualBuilt).filter(
        (s) => Array.isArray(s.items) && s.items.length > 0,
      );

      goToRunWithSections(merged, title || "AI Inspection");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to generate inspection.";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }

  const gridModeButtons = useMemo(
    () =>
      [
        { value: "hyd" as const, label: "Hydraulic" },
        { value: "air" as const, label: "Air" },
        { value: "none" as const, label: "None" },
      ] as const,
    [],
  );

  const samplePrompts = useMemo(
    () => [
      {
        label: "Hydraulic brake (30pt + tires)",
        prompt: "Brake inspection, hydraulic, include tires, 30 point",
      },
      {
        label: "HD pre-trip (60pt + tires + batteries)",
        prompt:
          "Pre-trip inspection for heavy duty truck, air brakes, include tires, include batteries, 60 point",
      },
      {
        label: "Oil change (diesel, 15pt)",
        prompt: "Small oil change inspection diesel, 15 point",
      },
      {
        label: "Trailer annual (air, 50pt + tires)",
        prompt:
          "Trailer annual inspection, air brakes, include tires, 50 point",
      },
      {
        label: "Battery + charging (20pt + battery grid)",
        prompt:
          "Battery + charging system inspection, include battery grid, 20 point",
      },
    ],
    [],
  );

  const visibleSections = useMemo(() => {
    const query = sectionQuery.trim().toLowerCase();
    if (!query) return masterInspectionList;
    return masterInspectionList.filter((section) =>
      section.title.toLowerCase().includes(query),
    );
  }, [sectionQuery]);

  const activeSection = useMemo(
    () =>
      masterInspectionList.find(
        (section) => section.title === activeSectionTitle,
      ) ?? masterInspectionList[0],
    [activeSectionTitle],
  );

  const visibleActiveItems = useMemo(() => {
    const query = itemQuery.trim().toLowerCase();
    if (!activeSection) return [];
    if (!query) return activeSection.items;
    return activeSection.items.filter((item) =>
      item.item.toLowerCase().includes(query),
    );
  }, [activeSection, itemQuery]);

  const selectedSectionCount = useMemo(
    () => Object.values(selections).filter((items) => items.length > 0).length,
    [selections],
  );

  const optionalFeatureCount = [
    includeOil,
    includeTireGrid,
    includeBatteryGrid,
    includeGreaseChassis,
  ].filter(Boolean).length;

  const inputClass =
    "w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3.5 py-2.5 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] transition focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20";
  const panelClass =
    "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-[var(--theme-shadow-medium)]";
  const quietButtonClass =
    "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:border-blue-500/30 hover:bg-[color:var(--theme-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";
  const primaryButtonClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-500/70 bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.22)] transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60";

  const methodOptions = [
    {
      id: "template" as const,
      title: "Start from a template",
      description:
        "Build a proven inspection for the vehicle and brake system.",
      icon: FileStack,
    },
    {
      id: "prompt" as const,
      title: "Describe what you need",
      description:
        "Turn a plain-language request into a structured inspection.",
      icon: Sparkles,
    },
    {
      id: "manual" as const,
      title: "Build manually",
      description: "Choose every section and check with full control.",
      icon: ListChecks,
    },
  ];

  const methodTitle =
    methodOptions.find((method) => method.id === buildMethod)?.title ??
    "Build inspection";
  const displayedCheckCount =
    buildMethod === "manual" ? totalSelected : targetCount;
  const reviewInspection =
    buildMethod === "manual"
      ? startManual
      : buildMethod === "prompt"
        ? buildFromPrompt
        : startQuickFromMaster;
  const reviewDisabled =
    !title.trim() ||
    (buildMethod === "prompt" && (!aiPrompt.trim() || aiLoading));
  const readinessLabel = !title.trim()
    ? "Inspection name required"
    : buildMethod === "prompt" && !aiPrompt.trim()
      ? "Description required"
      : aiLoading
        ? "Building inspection"
        : "Ready to review";

  return (
    <div className="relative px-3 py-5 text-[color:var(--theme-text-primary)] sm:px-4 sm:py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.11),transparent_55%)]"
      />
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <header className={cx(panelClass, "p-5 sm:p-6")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
                <ClipboardCheck className="h-4 w-4" aria-hidden />
                Custom Inspection
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Build a focused inspection
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
                Set the basics, choose one build method, then review the
                technician experience.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)] lg:self-auto">
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  reviewDisabled ? "bg-amber-500" : "bg-emerald-500",
                )}
              />
              {readinessLabel}
            </div>
          </div>
        </header>

        <section
          className={cx(panelClass, "overflow-hidden")}
          aria-labelledby="inspection-setup-heading"
        >
          <div className="border-b border-[color:var(--theme-border-soft)] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-sm font-bold text-blue-500">
                1
              </span>
              <div>
                <h2
                  id="inspection-setup-heading"
                  className="text-sm font-semibold"
                >
                  Inspection setup
                </h2>
                <p className="text-xs text-[color:var(--theme-text-secondary)]">
                  The details technicians and advisors will recognize.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.7fr)_minmax(150px,0.5fr)]">
            <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Inspection name
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Custom inspection"
                className={cx(inputClass, "mt-1.5")}
              />
            </label>
            <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Duty class
              <select
                value={dutyClass}
                onChange={(event) =>
                  setDutyClass(event.target.value as DutyClass)
                }
                className={cx(inputClass, "mt-1.5")}
              >
                <option value="light">Light duty</option>
                <option value="medium">Medium duty</option>
                <option value="heavy">Heavy duty</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
              Estimated labor
              <div className="relative mt-1.5">
                <input
                  inputMode="decimal"
                  value={laborHours}
                  onChange={(event) =>
                    setLaborHours(cleanNumericString(event.target.value))
                  }
                  placeholder="0.8"
                  className={cx(inputClass, "pr-12")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--theme-text-muted)]">
                  hr
                </span>
              </div>
            </label>
          </div>

          <details className="border-t border-[color:var(--theme-border-soft)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm font-medium text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-subtle)] [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2">
                <Settings2 className="h-4 w-4" aria-hidden />
                <span className="truncate">
                  Measurement grids and included services
                </span>
              </span>
              <span className="hidden shrink-0 text-xs text-[color:var(--theme-text-muted)] sm:inline">
                {compactGridLabel(gridMode)} brakes · {optionalFeatureCount}{" "}
                included
              </span>
            </summary>
            <div className="grid gap-5 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 lg:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                  Corner measurement grid
                </div>
                <div className="mt-2 grid grid-cols-3 rounded-xl bg-[color:var(--theme-surface-page)] p-1">
                  {gridModeButtons.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={gridMode === option.value}
                      onClick={() => {
                        setGridTouched(true);
                        setGridMode(option.value);
                      }}
                      className={cx(
                        "min-h-9 rounded-lg text-xs font-medium transition",
                        gridMode === option.value
                          ? "bg-blue-500/10 text-blue-500 shadow-sm ring-1 ring-blue-500/25"
                          : "text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                  Included services
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={includeOil}
                    onClick={() => setIncludeOil((current) => !current)}
                    className={selectionButtonClasses(includeOil)}
                  >
                    Oil service
                    {includeOil ? (
                      <Check className="h-4 w-4 text-current" aria-hidden />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    aria-pressed={includeTireGrid}
                    onClick={() => setIncludeTireGrid((current) => !current)}
                    className={selectionButtonClasses(includeTireGrid)}
                  >
                    Tire measurements
                    {includeTireGrid ? (
                      <Check className="h-4 w-4 text-current" aria-hidden />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    aria-pressed={includeBatteryGrid}
                    onClick={() => setIncludeBatteryGrid((current) => !current)}
                    className={selectionButtonClasses(includeBatteryGrid)}
                  >
                    Battery measurements
                    {includeBatteryGrid ? (
                      <Check className="h-4 w-4 text-current" aria-hidden />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    aria-pressed={includeGreaseChassis}
                    onClick={() =>
                      setIncludeGreaseChassis((current) => !current)
                    }
                    className={selectionButtonClasses(includeGreaseChassis)}
                  >
                    Grease chassis
                    {includeGreaseChassis ? (
                      <Check className="h-4 w-4 text-current" aria-hidden />
                    ) : null}
                  </button>
                </div>
                {includeOil ? (
                  <label className="mt-3 block text-xs font-medium text-[color:var(--theme-text-secondary)]">
                    Oil service engine
                    <select
                      value={oilEngineType}
                      onChange={(event) =>
                        setOilEngineType(event.target.value as EngineType)
                      }
                      className={cx(inputClass, "mt-1.5")}
                    >
                      <option value="gas">Gas</option>
                      <option value="diesel">Diesel</option>
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
          </details>
        </section>

        <section
          className={cx(panelClass, "overflow-hidden")}
          aria-labelledby="build-method-heading"
        >
          <div className="border-b border-[color:var(--theme-border-soft)] px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-sm font-bold text-blue-500">
                2
              </span>
              <div>
                <h2 id="build-method-heading" className="text-sm font-semibold">
                  Choose how to build
                </h2>
                <p className="text-xs text-[color:var(--theme-text-secondary)]">
                  Only the active workspace is shown.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 md:grid-cols-3">
            {methodOptions.map((method) => {
              const Icon = method.icon;
              const active = method.id === buildMethod;
              return (
                <button
                  key={method.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBuildMethod(method.id)}
                  className={cx(
                    "flex min-h-[86px] items-start gap-3 rounded-xl border p-3 text-left transition",
                    active
                      ? "border-blue-500/30 bg-[color:var(--theme-surface-page)] shadow-sm ring-1 ring-blue-500/20"
                      : "border-transparent text-[color:var(--theme-text-secondary)] hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-page)]",
                  )}
                >
                  <span
                    className={cx(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      active
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-[color:var(--theme-surface-subtle)]",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {method.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5">
                      {method.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-5 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              {buildMethod === "template" ? (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-base font-semibold">
                      Configure the starting template
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      ProFixIQ selects the right checks from the master
                      inspection library.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
                      Vehicle
                      <select
                        value={vehicleType}
                        onChange={(event) => {
                          setQuickTouched(true);
                          setVehicleType(event.target.value as VehicleType);
                        }}
                        className={cx(inputClass, "mt-1.5")}
                      >
                        <option value="car">Car</option>
                        <option value="truck">Truck</option>
                        <option value="bus">Bus</option>
                        <option value="trailer">Trailer</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
                      Brake system
                      <select
                        value={brakeSystem}
                        onChange={(event) => {
                          setQuickTouched(true);
                          setBrakeSystem(event.target.value as BrakeSystem);
                        }}
                        className={cx(inputClass, "mt-1.5")}
                      >
                        <option value="hyd_brake">Hydraulic</option>
                        <option value="air_brake">Air</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-[color:var(--theme-text-secondary)]">
                      Inspection size
                      <select
                        value={String(targetCount)}
                        onChange={(event) => {
                          setQuickTouched(true);
                          setTargetCount(Number(event.target.value));
                        }}
                        className={cx(inputClass, "mt-1.5")}
                      >
                        <option value="30">Focused · 30 checks</option>
                        <option value="60">Standard · 60 checks</option>
                        <option value="80">Detailed · 80 checks</option>
                        <option value="120">Comprehensive · 120 checks</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                        Vehicle profile
                      </div>
                      <div className="mt-1 text-sm font-medium capitalize">
                        {vehicleType}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                        Brake checks
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {brakeSystem === "air_brake"
                          ? "Air brake"
                          : "Hydraulic"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                        Commercial coverage
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {cvipGroup ? "Included" : "Not required"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {buildMethod === "prompt" ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold">
                      Describe the inspection
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      Include the vehicle, brake system, desired size, and any
                      measurements.
                    </p>
                  </div>
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => {
                      const next = event.target.value;
                      setAiPrompt(next);
                      setAiPreset(null);
                      scheduleAutoTriggerApply(next);
                    }}
                    onBlur={() => {
                      if (aiPrompt.trim()) applyPromptToControls(aiPrompt);
                    }}
                    placeholder="Example: Heavy-duty pre-trip inspection with air brakes, tire measurements, batteries, and 60 checks."
                    className={cx(inputClass, "min-h-32 resize-y")}
                  />
                  <div>
                    <div className="mb-2 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                      Common starting points
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {samplePrompts.slice(0, 3).map((sample) => (
                        <button
                          key={sample.label}
                          type="button"
                          onClick={() => {
                            setAiPreset(null);
                            setAiPrompt(sample.prompt);
                            applyPromptToControls(sample.prompt);
                          }}
                          className={quietButtonClass}
                        >
                          {sample.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                      Commercial presets
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(CVIP_PRESETS) as AiPresetKey[]).map(
                        (key) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={aiPreset === key}
                            onClick={() => applyAiPreset(key)}
                            className={cx(
                              quietButtonClass,
                              aiPreset === key &&
                                "border-blue-500/30 bg-blue-500/10 text-blue-500",
                            )}
                          >
                            {CVIP_PRESETS[key].label}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  {aiError ? (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-500">
                      {aiError}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {buildMethod === "manual" ? (
                <div className="grid min-h-[480px] overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] lg:grid-cols-[240px_minmax(0,1fr)]">
                  <aside className="border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 lg:border-b-0 lg:border-r">
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
                        aria-hidden
                      />
                      <input
                        value={sectionQuery}
                        onChange={(event) =>
                          setSectionQuery(event.target.value)
                        }
                        placeholder="Find a section…"
                        aria-label="Find inspection section"
                        className={cx(inputClass, "pl-9")}
                      />
                    </div>
                    <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1 lg:max-h-[410px]">
                      {visibleSections.map((section) => {
                        const count = selections[section.title]?.length ?? 0;
                        const active = section.title === activeSection?.title;
                        return (
                          <button
                            key={section.title}
                            type="button"
                            onClick={() => {
                              setActiveSectionTitle(section.title);
                              setItemQuery("");
                            }}
                            className={cx(
                              "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition",
                              active
                                ? "bg-[color:var(--theme-surface-page)] font-semibold text-[color:var(--theme-text-primary)] shadow-sm"
                                : "text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-page)] hover:text-[color:var(--theme-text-primary)]",
                            )}
                          >
                            <span className="truncate">{section.title}</span>
                            <span
                              className={cx(
                                "rounded-full px-2 py-0.5 text-[10px]",
                                count > 0
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-muted)]",
                              )}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  <div className="min-w-0 p-4">
                    <div className="flex flex-col gap-3 border-b border-[color:var(--theme-border-soft)] pb-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold">
                          {activeSection?.title ?? "Inspection checks"}
                        </h3>
                        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                          {selections[activeSection?.title ?? ""]?.length ?? 0}{" "}
                          of {activeSection?.items.length ?? 0} selected
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            activeSection &&
                            selectAllInSection(
                              activeSection.title,
                              activeSection.items,
                            )
                          }
                          className={quietButtonClass}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            activeSection && clearSection(activeSection.title)
                          }
                          className={quietButtonClass}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="relative mt-4">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
                        aria-hidden
                      />
                      <input
                        value={itemQuery}
                        onChange={(event) => setItemQuery(event.target.value)}
                        placeholder="Search checks in this section…"
                        aria-label="Search inspection checks"
                        className={cx(inputClass, "pl-9")}
                      />
                    </div>
                    <div className="mt-3 grid max-h-[350px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {visibleActiveItems.map((item) => {
                        const checked = (
                          selections[activeSection?.title ?? ""] ?? []
                        ).includes(item.item);
                        return (
                          <label
                            key={item.item}
                            className={cx(
                              "group flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]",
                              checked &&
                                "border-[color:var(--brand-primary)] bg-[color:var(--theme-surface-panel)] ring-1 ring-[color:var(--brand-primary)]",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                activeSection &&
                                toggle(activeSection.title, item.item)
                              }
                              className="h-4 w-4 accent-[color:var(--brand-primary)]"
                            />
                            <span className="leading-snug">{item.item}</span>
                          </label>
                        );
                      })}
                    </div>
                    {visibleActiveItems.length === 0 ? (
                      <div className="py-10 text-center text-sm text-[color:var(--theme-text-secondary)]">
                        No checks match this search.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 xl:sticky xl:top-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">
                Inspection summary
              </div>
              <h3 className="mt-2 truncate text-base font-semibold">
                {title || "Untitled inspection"}
              </h3>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                {methodTitle}
              </p>
              <dl className="mt-4 divide-y divide-[color:var(--theme-border-soft)] text-xs">
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Checks
                  </dt>
                  <dd className="font-semibold">{displayedCheckCount}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Duty class
                  </dt>
                  <dd className="font-semibold">{dutyLabel}</dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Corner grid
                  </dt>
                  <dd className="font-semibold">
                    {compactGridLabel(gridMode)}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Included services
                  </dt>
                  <dd className="font-semibold">{optionalFeatureCount}</dd>
                </div>
                {buildMethod === "manual" ? (
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="text-[color:var(--theme-text-secondary)]">
                      Sections
                    </dt>
                    <dd className="font-semibold">{selectedSectionCount}</dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between py-2.5">
                  <dt className="text-[color:var(--theme-text-secondary)]">
                    Estimated labor
                  </dt>
                  <dd className="font-semibold">
                    {laborHours.trim() ? laborHours + " hr" : "Not set"}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] leading-5 text-emerald-700 dark:text-emerald-300">
                Review opens the technician-facing draft before anything is
                saved.
              </div>
            </aside>
          </div>
        </section>

        <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 p-3 shadow-[0_16px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-[color:var(--theme-text-secondary)]">
            <span>
              <strong className="text-[color:var(--theme-text-primary)]">
                {displayedCheckCount}
              </strong>{" "}
              checks
            </span>
            {buildMethod === "manual" ? (
              <span>
                <strong className="text-[color:var(--theme-text-primary)]">
                  {selectedSectionCount}
                </strong>{" "}
                sections
              </span>
            ) : null}
            <span>{optionalFeatureCount} included services</span>
            <span>
              {laborHours.trim()
                ? laborHours + " hr estimated"
                : "Labor estimate optional"}
            </span>
          </div>
          <button
            type="button"
            onClick={reviewInspection}
            disabled={reviewDisabled}
            className={cx(primaryButtonClass, "w-full shrink-0 sm:w-auto")}
          >
            {aiLoading ? "Building inspection…" : "Review inspection"}
            {!aiLoading ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}
