// /app/inspections/custom-inspection/page.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import {
  buildFromMaster,
  masterInspectionList,
  type BrakeSystem,
  type CvipGroup,
  type VehicleType,
} from "@inspections/lib/inspection/masterInspectionList";

type DutyClass = "light" | "medium" | "heavy";
type GridMode = "hyd" | "air" | "none";
type EngineType = "gas" | "diesel";

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
  return sections.some((s) => (s.title || "").toLowerCase().includes("tire grid"));
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
        items.push({ item: `${axle} ${side} Tire Pressure (Outer)`, unit: "psi" });
        items.push({ item: `${axle} ${side} Tire Pressure (Inner)`, unit: "psi" });
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
  return sections.some((s) => (s.title || "").toLowerCase().includes("battery grid"));
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
    const looksHyd = items.some((it) => HYD_ITEM_RE.test((it.item || it.name || "").trim()));
    const looksAir = items.some((it) => AIR_ITEM_RE.test((it.item || it.name || "").trim()));
    return !(looksHyd || looksAir);
  });

  if (gridMode === "air") sections = [buildAirCornerSection(), ...sections];
  if (gridMode === "hyd") sections = [buildHydraulicCornerSection(), ...sections];

  if (includeTires && !hasTireGrid(sections)) {
    const tire = gridMode === "air" ? buildAirTireGrid() : buildHydraulicTireGrid();
    const insertAt = sections.length > 0 ? 1 : 0;
    sections = [...sections.slice(0, insertAt), tire, ...sections.slice(insertAt)];
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
    // leave vehicle/brake flexible
  }
  if (/\bheavy\s*duty\b|\bclass\s*7\b|\bclass\s*8\b|\btractor\b|\bsemi\b/.test(p)) {
    inferred.dutyClass = "heavy";
    inferred.vehicleType = inferred.vehicleType ?? "truck";
  }

  // --- vehicle type hints
  if (/\btruck\b|\btractor\b|\bhighway\b|\bsemi\b/.test(p)) inferred.vehicleType = "truck";
  if (/\btrailer\b/.test(p)) inferred.vehicleType = "trailer";
  if (/\bbus\b|\bcoach\b|\bmotorcoach\b/.test(p)) inferred.vehicleType = "bus";

  // --- brake system hints
  if (/\bair\s*brake\b|\bairbrake\b|\bpush\s*rod\b|\bslack\s*adjuster\b/.test(p)) {
    inferred.brakeSystem = "air_brake";
    inferred.gridMode = inferred.gridMode ?? "air";
  }
  if (/\bhydraulic\b|\bhyd\b|\bpassenger\b/.test(p)) {
    inferred.brakeSystem = inferred.brakeSystem ?? "hyd_brake";
    inferred.gridMode = inferred.gridMode ?? "hyd";
  }

  // --- grids/toggles
  if (/\btire\s*grid\b|\btires?\b.*\bpressure\b|\btread\b/.test(p)) inferred.includeTireGrid = true;
  if (/\bbattery\s*grid\b|\bbatter(y|ies)\b|\bcca\b/.test(p)) inferred.includeBatteryGrid = true;
  if (/\bgrease\b|\bchassis\b/.test(p)) inferred.includeGreaseChassis = true;

  // --- oil hints
  if (/\boil\s*change\b|\boil\b.*\bfilter\b/.test(p)) inferred.includeOil = true;
  if (/\bdiesel\b/.test(p)) inferred.oilEngineType = "diesel";
  if (/\bgas\b|\bgasoline\b/.test(p)) inferred.oilEngineType = "gas";

  // --- explicit corner grid disable
  if (/\bno\s*corner\s*grid\b|\bwithout\s*corner\s*grid\b|\bno\s*grid\b/.test(p)) {
    inferred.gridMode = "none";
  }

  // --- title hint (very light-touch)
  if (/\bcvip\b/.test(p)) inferred.titleHint = "CVIP Inspection";
  if (/\bpre\s*trip\b|\bpretrip\b/.test(p)) inferred.titleHint = "Pre-Trip Inspection";
  if (/\bbrake\b/.test(p) && /\binspect\b|\binspection\b/.test(p)) inferred.titleHint = "Brake Inspection";

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
  if (v === "truck") return b === "air_brake" ? "cvip_truck_air" : "cvip_truck_hyd";
  if (v === "trailer") return b === "air_brake" ? "cvip_trailer_air" : "cvip_trailer_hyd";
  if (v === "bus") return b === "air_brake" ? "cvip_bus_air" : "cvip_bus_hyd";
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Small UI helpers                                                   */
/* ------------------------------------------------------------------ */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function compactGridLabel(mode: GridMode) {
  if (mode === "air") return "Air";
  if (mode === "hyd") return "Hydraulic";
  return "None";
}

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [dutyClass, setDutyClass] = useState<DutyClass>("heavy");
  const [laborHours, setLaborHours] = useState<string>("");

  const [gridMode, setGridMode] = useState<GridMode>(dutyClass === "heavy" ? "air" : "hyd");
  const [gridTouched, setGridTouched] = useState(false);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [includeOil, setIncludeOil] = useState(true);
  const [oilEngineType, setOilEngineType] = useState<EngineType>("diesel");

  const [includeBatteryGrid, setIncludeBatteryGrid] = useState(false);
  const [batteryCount] = useState<number>(1);

  const [includeTireGrid, setIncludeTireGrid] = useState(false);
  const [includeGreaseChassis, setIncludeGreaseChassis] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPreset, setAiPreset] = useState<AiPresetKey | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [vehicleType, setVehicleType] = useState<VehicleType>(dutyClass === "light" ? "car" : "truck");
  const [brakeSystem, setBrakeSystem] = useState<BrakeSystem>(dutyClass === "heavy" ? "air_brake" : "hyd_brake");
  const [targetCount, setTargetCount] = useState<number>(80);

  const [quickTouched, setQuickTouched] = useState(false);

  // triggers: avoid spamming apply on every keystroke (still “auto”)
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

  const cvipGroup = useMemo(() => inferCvipGroup(vehicleType, brakeSystem), [vehicleType, brakeSystem]);

  const dutyLabel =
    dutyClass === "light" ? "Light duty" : dutyClass === "medium" ? "Medium duty" : "Heavy duty";

  const totalSelected = useMemo(
    () => Object.values(selections).reduce((sum, arr) => sum + (arr?.length ?? 0), 0),
    [selections],
  );

  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      if (cur.has(item)) cur.delete(item);
      else cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  function selectAllInSection(sectionTitle: string, items: Array<{ item: string }>) {
    setSelections((prev) => ({ ...prev, [sectionTitle]: items.map((i) => i.item) }));
  }
  function clearSection(sectionTitle: string) {
    setSelections((prev) => ({ ...prev, [sectionTitle]: [] }));
  }

  function toggleSectionCollapsed(sectionTitle: string) {
    setCollapsedSections((prev) => ({ ...prev, [sectionTitle]: !prev[sectionTitle] }));
  }

  function buildOilSection(engine: EngineType): Section {
    return {
      title: engine === "diesel" ? "Oil Change (Diesel)" : "Oil Change (Gas)",
      items: [{ item: "Drain and fill engine oil" }, { item: "Replace oil filter" }],
    };
  }

  function buildGreaseChassisSection(): Section {
    return { title: "Grease Chassis", items: [{ item: "Grease chassis" }] };
  }

  function goToRunWithSections(sections: Section[] | unknown, tplTitle: string) {
    const base = Array.isArray(sections) ? (sections as Section[]) : [];

    let finalSections = prepareSections(base, gridMode, includeTireGrid, includeBatteryGrid, batteryCount);

    if (
      includeGreaseChassis &&
      !finalSections.some((s) => normalizeTitle(s.title) === "grease chassis")
    ) {
      finalSections = [...finalSections, buildGreaseChassisSection()];
    }

    sessionStorage.setItem("inspection:sections", JSON.stringify(finalSections));
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

    router.push(`/inspections/custom-draft?${qs.toString()}`);
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
      includeOil && !built.some((s) => normalizeTitle(s.title).startsWith("oil change"))
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
      includeOil && !built.some((s) => normalizeTitle(s.title).startsWith("oil change"))
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

    if (typeof inferred.includeTireGrid === "boolean") setIncludeTireGrid(inferred.includeTireGrid);
    if (typeof inferred.includeBatteryGrid === "boolean")
      setIncludeBatteryGrid(inferred.includeBatteryGrid);
    if (typeof inferred.includeGreaseChassis === "boolean")
      setIncludeGreaseChassis(inferred.includeGreaseChassis);

    if (typeof inferred.includeOil === "boolean") setIncludeOil(inferred.includeOil);
    if (inferred.oilEngineType) setOilEngineType(inferred.oilEngineType);

    if (inferred.titleHint && (!title || title.toLowerCase().includes("custom inspection"))) {
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
      applyPromptToControls(aiPrompt);

      const res = await fetch("/api/inspections/build-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          dutyClass,
          vehicleType,
          brakeSystem,
          targetCount,
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Generate failed (${res.status})`);
      }

      const payload = (await res.json()) as { sections: Section[] };
      const aiSections = Array.isArray(payload.sections) ? payload.sections : [];

      const manualBuilt = buildInspectionFromSelections({
        selections,
        extraServiceItems: [],
      }) as unknown as Section[];

      const aiHasOil = aiSections.some((s) => normalizeTitle(s.title).startsWith("oil change"));
      const manualHasOil = manualBuilt.some((s) => normalizeTitle(s.title).startsWith("oil change"));

      const base =
        includeOil && !aiHasOil && !manualHasOil
          ? [...aiSections, buildOilSection(oilEngineType)]
          : aiSections;

      const merged = mergeSections(base, manualBuilt).filter(
        (s) => Array.isArray(s.items) && s.items.length > 0,
      );

      goToRunWithSections(merged, title || "AI Inspection");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate inspection.";
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
      { label: "Hydraulic brake (30pt + tires)", prompt: "Brake inspection, hydraulic, include tires, 30 point" },
      {
        label: "HD pre-trip (60pt + tires + batteries)",
        prompt:
          "Pre-trip inspection for heavy duty truck, air brakes, include tires, include batteries, 60 point",
      },
      { label: "Oil change (diesel, 15pt)", prompt: "Small oil change inspection diesel, 15 point" },
      {
        label: "Trailer annual (air, 50pt + tires)",
        prompt: "Trailer annual inspection, air brakes, include tires, 50 point",
      },
      {
        label: "Battery + charging (20pt + battery grid)",
        prompt: "Battery + charging system inspection, include battery grid, 20 point",
      },
    ],
    [],
  );

  const topChips = useMemo(() => {
    const chips: Array<{ k: string; v: string }> = [];
    chips.push({ k: "Duty", v: dutyLabel });
    chips.push({ k: "Corner Grid", v: compactGridLabel(gridMode) });
    chips.push({ k: "Tires", v: includeTireGrid ? "On" : "Off" });
    chips.push({ k: "Batteries", v: includeBatteryGrid ? "On" : "Off" });
    chips.push({ k: "Grease", v: includeGreaseChassis ? "On" : "Off" });
    chips.push({ k: "Oil", v: includeOil ? oilEngineType.toUpperCase() : "Off" });
    chips.push({ k: "Selected", v: String(totalSelected) });
    if (laborHours.trim()) chips.push({ k: "Hours", v: laborHours.trim() });
    return chips;
  }, [
    dutyLabel,
    gridMode,
    includeTireGrid,
    includeBatteryGrid,
    includeGreaseChassis,
    includeOil,
    oilEngineType,
    totalSelected,
    laborHours,
  ]);

  // ✅ Copper-only (no orange fills / no brown pill backgrounds)
  const COPPER = "var(--accent-copper-soft,#c87a43)";
  const COPPER_BORDER = `border-[color:${COPPER}]`;
  const COPPER_RING = `focus:ring-[color:${COPPER}]`;

  const tileBase =
    "rounded-full border border-[color:var(--metal-border-soft,rgba(255,255,255,0.12))] bg-black/45 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-black/55";

  // Active pills: same text color, copper outline, NO background tint
  const tileOn =
    "rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-black/55 " +
    COPPER_BORDER +
    " shadow-[0_0_0_1px_rgba(200,122,67,0.15)]";

  // Primary/secondary buttons: copper outline + neutral text (no orange fill)
  const primaryBtn =
    "rounded-full border bg-black/45 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-black/55 disabled:opacity-60 " +
    COPPER_BORDER;

  const secondaryBtn =
    "rounded-full border bg-black/35 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:bg-black/45 disabled:opacity-60 " +
    COPPER_BORDER;

  const inputBase =
    "rounded-xl border border-neutral-700 bg-neutral-900/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 " +
    COPPER_RING +
    " focus:border-[color:var(--accent-copper-soft,#c87a43)]";

  const selectBase =
    "rounded-xl border border-neutral-700 bg-neutral-900/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 " +
    COPPER_RING +
    " focus:border-[color:var(--accent-copper-soft,#c87a43)]";

  return (
    <div className="p-4 text-white">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-black/55 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-6">
        <div className="mb-4 flex flex-col items-center gap-3 md:flex-row md:items-end md:justify-between">
          <div className="text-center md:text-left">
            <h1
              className={cx(
                "text-2xl font-bold tracking-[0.18em]",
                "text-[color:var(--accent-copper-soft,#c87a43)]",
              )}
              style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
            >
              Inspection Builder
            </h1>
            <div className="mt-1 text-xs text-neutral-400">
              Quick build, prompt build, or manual selection — all from your master list.
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {topChips.map((c) => (
              <span
                key={c.k}
                className={cx(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]",
                  "bg-transparent text-neutral-200",
                  COPPER_BORDER, // ✅ copper outline only
                )}
              >
                <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{c.k}</span>
                <span className="font-semibold text-neutral-100">{c.v}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-neutral-300">Template title</span>
            <input className={inputBase} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-neutral-300">Duty Class</span>
              <select
                className={selectBase}
                value={dutyClass}
                onChange={(e) => setDutyClass(e.target.value as DutyClass)}
              >
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="heavy">Heavy</option>
              </select>
              <span className="mt-1 text-[11px] text-neutral-500">
                Influences defaults (vehicle/brake + corner grid). You can override below.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-neutral-300">Labor hours</span>
              <input
                inputMode="decimal"
                className={inputBase}
                value={laborHours}
                onChange={(e) => setLaborHours(e.target.value)}
                placeholder="e.g. 2.5"
              />
              <span className="mt-1 text-[11px] text-neutral-500">Optional. Stored in inspection params.</span>
            </label>
          </div>
        </div>

        {/* Toggles row (neutral text, copper outline only) */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setIncludeOil((v) => !v)}
            className={includeOil ? tileOn : tileBase}
            title="Include an oil change section"
          >
            Oil {includeOil ? `• ${oilEngineType.toUpperCase()}` : "• Off"}
          </button>

          {includeOil && (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Engine</span>
              <select
                className={cx(
                  "rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1 text-[12px] text-white focus:outline-none focus:ring-2",
                  COPPER_RING,
                  "focus:border-[color:var(--accent-copper-soft,#c87a43)]",
                )}
                value={oilEngineType}
                onChange={(e) => setOilEngineType(e.target.value as EngineType)}
              >
                <option value="gas">Gas</option>
                <option value="diesel">Diesel</option>
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIncludeTireGrid((v) => !v)}
            className={includeTireGrid ? tileOn : tileBase}
            title="Add a tire grid section if not present"
          >
            Tire Grid {includeTireGrid ? "• On" : "• Off"}
          </button>

          <button
            type="button"
            onClick={() => setIncludeBatteryGrid((v) => !v)}
            className={includeBatteryGrid ? tileOn : tileBase}
            title="Add a battery grid section if not present"
          >
            Battery Grid {includeBatteryGrid ? "• On" : "• Off"}
          </button>

          <button
            type="button"
            onClick={() => setIncludeGreaseChassis((v) => !v)}
            className={includeGreaseChassis ? tileOn : tileBase}
            title="Add a grease chassis section"
          >
            Grease {includeGreaseChassis ? "• On" : "• Off"}
          </button>
        </div>

        {/* Corner Grid mode */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Corner grid</span>
          {gridModeButtons.map((opt) => {
            const active = gridMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setGridTouched(true);
                  setGridMode(opt.value);
                }}
                className={active ? tileOn : tileBase}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Quick build */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="mb-1 text-center text-sm font-semibold text-[color:var(--accent-copper-soft,#c87a43)]">
            Quick Build
          </div>
          <p className="mb-3 text-center text-sm text-neutral-400">
            Deterministic build from your master list (keeps CVIP/spec codes).
          </p>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Vehicle</span>
              <select
                className={selectBase}
                value={vehicleType}
                onChange={(e) => {
                  setQuickTouched(true);
                  setVehicleType(e.target.value as VehicleType);
                }}
              >
                <option value="car">Car</option>
                <option value="truck">Truck</option>
                <option value="bus">Bus</option>
                <option value="trailer">Trailer</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Brake system</span>
              <select
                className={selectBase}
                value={brakeSystem}
                onChange={(e) => {
                  setQuickTouched(true);
                  setBrakeSystem(e.target.value as BrakeSystem);
                }}
              >
                <option value="hyd_brake">Hydraulic</option>
                <option value="air_brake">Air</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Target count</span>
              <input
                type="number"
                min={10}
                max={250}
                className={cx(
                  "rounded-xl border border-neutral-700 bg-neutral-900/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2",
                  COPPER_RING,
                  "focus:border-[color:var(--accent-copper-soft,#c87a43)]",
                )}
                value={String(targetCount)}
                onChange={(e) => {
                  setQuickTouched(true);
                  setTargetCount(Number(e.target.value) || 80);
                }}
              />
            </label>

            <div className="flex flex-col justify-end gap-2">
              <div className="text-[11px] text-neutral-500">
                CVIP group: <span className="font-semibold text-neutral-100">{cvipGroup ?? "—"}</span>
              </div>
              <button type="button" onClick={startQuickFromMaster} className={primaryBtn}>
                Start (Quick Build)
              </button>
            </div>
          </div>
        </div>

        {/* Prompt build */}
        <div className="mb-8 rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="mb-1 text-center text-sm font-semibold text-[color:var(--accent-copper-soft,#c87a43)]">
            Prompt Build
          </div>
          <p className="mb-3 text-center text-sm text-neutral-400">
            Triggers auto-apply while typing (air/hydraulic, tires, batteries, grease, oil, “60 point”, etc).
          </p>

          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            {samplePrompts.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setAiPreset(null);
                  setAiPrompt(s.prompt);
                  applyPromptToControls(s.prompt);
                }}
                className={secondaryBtn + " px-3 py-1 text-[11px]"}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            {(Object.keys(CVIP_PRESETS) as AiPresetKey[]).map((key) => {
              const active = aiPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyAiPreset(key)}
                  className={(active ? primaryBtn : secondaryBtn) + " px-3 py-1 text-[11px]"}
                >
                  {CVIP_PRESETS[key].label}
                </button>
              );
            })}
          </div>

          <textarea
            className={cx(
              "mb-3 min-h-[90px] w-full rounded-xl border border-neutral-700 bg-neutral-900/70 p-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2",
              COPPER_RING,
              "focus:border-[color:var(--accent-copper-soft,#c87a43)]",
            )}
            placeholder="e.g. brake inspection, hydraulic, include tires, 30 point"
            value={aiPrompt}
            onChange={(e) => {
              const next = e.target.value;
              setAiPrompt(next);
              setAiPreset(null);
              scheduleAutoTriggerApply(next);
            }}
            onBlur={() => {
              if (aiPrompt.trim()) applyPromptToControls(aiPrompt);
            }}
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={buildFromPrompt} disabled={aiLoading || !aiPrompt.trim()} className={primaryBtn}>
              {aiLoading ? "Generating…" : "Build from Prompt"}
            </button>

            {aiError ? <span className="text-xs text-red-400">{aiError}</span> : null}
          </div>

          <div className="mt-3 text-center text-[11px] text-neutral-500">
            Tip: include <span className="text-neutral-200">air brake</span>,{" "}
            <span className="text-neutral-200">hydraulic</span>,{" "}
            <span className="text-neutral-200">tire grid</span>,{" "}
            <span className="text-neutral-200">battery grid</span>,{" "}
            <span className="text-neutral-200">grease chassis</span>,{" "}
            <span className="text-neutral-200">oil change diesel</span>,{" "}
            <span className="text-neutral-200">60 point</span>.
          </div>
        </div>

        {/* Manual pick list */}
        <div className="mb-8 space-y-4">
          {masterInspectionList.map((sec) => {
            const selectedCount = selections[sec.title]?.length ?? 0;
            const collapsed = collapsedSections[sec.title] ?? false;

            return (
              <div
                key={sec.title}
                className="rounded-2xl border border-white/10 bg-black/40 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.7)]"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-neutral-100">{sec.title}</div>
                    <span
                      className={cx(
                        "rounded-full border bg-transparent px-2 py-[2px] text-[11px] text-neutral-300",
                        COPPER_BORDER,
                      )}
                    >
                      {selectedCount}/{sec.items.length} selected
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllInSection(sec.title, sec.items)}
                      className={secondaryBtn + " px-3 py-1 text-[11px]"}
                    >
                      Select all
                    </button>
                    <button type="button" onClick={() => clearSection(sec.title)} className={tileBase + " px-3 py-1"}>
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapsed(sec.title)}
                      className={tileBase + " px-3 py-1"}
                    >
                      {collapsed ? "Expand" : "Collapse"}
                    </button>
                  </div>
                </div>

                {!collapsed && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {sec.items.map((i) => {
                      const label = i.item;
                      const checked = (selections[sec.title] ?? []).includes(label);

                      return (
                        <label
                          key={label}
                          className={cx(
                            "flex items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-sm text-neutral-100",
                            checked && COPPER_BORDER,
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(sec.title, label)}
                            className="h-4 w-4 accent-[color:var(--accent-copper-soft,#c87a43)]"
                          />
                          <span className="text-xs sm:text-sm">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {collapsed && (
                  <p className="mt-1 text-[11px] text-neutral-500">Collapsed. Expand to adjust individual checks.</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={startManual} className={primaryBtn}>
            Start (Manual)
          </button>

          <button onClick={startQuickFromMaster} className={secondaryBtn}>
            Start (Quick Build)
          </button>

          <button onClick={buildFromPrompt} disabled={aiLoading || !aiPrompt.trim()} className={secondaryBtn}>
            {aiLoading ? "Generating…" : "Start (Prompt)"}
          </button>
        </div>
      </div>
    </div>
  );
}