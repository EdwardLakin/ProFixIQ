// app/inspections/custom/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";

type DutyClass = "light" | "medium" | "heavy";
type GridMode = "hyd" | "air" | "none";
type EngineType = "gas" | "diesel";

// Minimal shape we care about when merging/staging
type Section = {
  title: string;
  items: Array<{ item?: string; name?: string; unit?: string | null }>;
};

/* ------------------------------------------------------------------ */
/* Corner-grid detection + builders (FINAL / CANONICAL)               */
/* ------------------------------------------------------------------ */

// LF/RF/LR/RR
const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;

// Steer / Drive / Tag / Trailer
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
/* TIRE GRIDS (SEPARATE FROM BRAKES)                                  */
/* ------------------------------------------------------------------ */

function hasTireGrid(sections: Section[]): boolean {
  return sections.some((s) => (s.title || "").toLowerCase().includes("tire grid"));
}

/* ---- AIR BRAKE TIRE GRID (axles) ---- */
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

    // ✅ ADDED: row-level status carrier so TireGrid can render StatusButtons
    // even when only pressure/tread fields exist.
    items.push({ item: `${axle} Tire Status`, unit: null });

    for (const side of sides) {
      if (!isDual) {
        // SINGLE (Steer): 1 TP + 1 TD
        items.push({ item: `${axle} ${side} Tire Pressure`, unit: "psi" });
        items.push({ item: `${axle} ${side} Tread Depth`, unit: "mm" });
      } else {
        // DUAL (Drive/Rear/Tag/Trailer): TP + TD inner/outer
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
/* ---- HYDRAULIC TIRE GRID (automotive) ---- */
function buildHydraulicTireGrid(): Section {
  // front is single
  const front = ["LF", "RF"] as const;

  // rear defaults to dual-capable (inner/outer labels always present)
  const rear = ["LR", "RR"] as const;

  const items: Section["items"] = [];

  // ✅ ADDED: row-level status carriers (matches TireGrid fallback paths)
  items.push({ item: "Steer 1 Tire Status", unit: null });
  items.push({ item: "Rear 1 Tire Status", unit: null });

  for (const c of front) {
    items.push({ item: `${c} Tire Pressure`, unit: "psi" });
    items.push({ item: `${c} Tread Depth (Outer)`, unit: "mm" }); // keep label consistent with grid parser
  }

  for (const c of rear) {
    // pressure
    items.push({ item: `${c} Tire Pressure (Outer)`, unit: "psi" });
    items.push({ item: `${c} Tire Pressure (Inner)`, unit: "psi" });

    // tread depth
    items.push({ item: `${c} Tread Depth (Outer)`, unit: "mm" });
    items.push({ item: `${c} Tread Depth (Inner)`, unit: "mm" });
  }

  return {
    title: "Tire Grid – Hydraulic",
    items,
  };
}
/* ------------------------------------------------------------------ */
/* BATTERY GRID (CCA ONLY, 1–5 BATTERIES)                             */
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
    { title: string; items: { item: string; unit?: string | null }[] }
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
        out[key].items.push({ item: label, unit: raw.unit ?? null });
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
  // Strip any pre-existing corner-grid-ish sections to prevent duplicates
  let sections = (base || []).filter((s) => {
    const title = s?.title ?? "";
    if (looksLikeCornerTitle(title)) return false;

    const items = s.items ?? [];
    const looksHyd = items.some((it) => HYD_ITEM_RE.test((it.item || it.name || "").trim()));
    const looksAir = items.some((it) => AIR_ITEM_RE.test((it.item || it.name || "").trim()));
    return !(looksHyd || looksAir);
  });

  // Inject corner grid FIRST
  if (gridMode === "air") sections = [buildAirCornerSection(), ...sections];
  if (gridMode === "hyd") sections = [buildHydraulicCornerSection(), ...sections];

  // Inject tire grid AFTER corner grid
  if (includeTires && !hasTireGrid(sections)) {
    const tire = gridMode === "air" ? buildAirTireGrid() : buildHydraulicTireGrid();
    const insertAt = sections.length > 0 ? 1 : 0;
    sections = [...sections.slice(0, insertAt), tire, ...sections.slice(insertAt)];
  }

  // Inject battery grid AFTER tires (or after corner grid if no tires)
  if (includeBattery && !hasBatteryGrid(sections)) {
    const insertAt = sections.length >= 2 ? 2 : sections.length; // best-effort
    sections = [
      ...sections.slice(0, insertAt),
      buildBatteryGrid(batteryCount),
      ...sections.slice(insertAt),
    ];
  }

  return sections;
}

/* ------------------------------------------------------------------ */

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [dutyClass, setDutyClass] = useState<DutyClass>("heavy");

  // labor hours (string so user can delete)
  const [laborHours, setLaborHours] = useState<string>("");

  const [gridMode, setGridMode] = useState<GridMode>(dutyClass === "heavy" ? "air" : "hyd");
  const [gridTouched, setGridTouched] = useState(false);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [includeOil, setIncludeOil] = useState(true);
  const [oilEngineType, setOilEngineType] = useState<EngineType>("diesel");

  const [includeBatteryGrid, setIncludeBatteryGrid] = useState(false);
  const [batteryCount, setBatteryCount] = useState<number>(2);

  // toggles
  const [includeTireGrid, setIncludeTireGrid] = useState(false);
  const [includeGreaseChassis, setIncludeGreaseChassis] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (gridTouched) return;
    setGridMode(dutyClass === "heavy" ? "air" : "hyd");
  }, [dutyClass, gridTouched]);

  const gridModeLabel =
    gridMode === "air"
      ? "Air brake corner grid (Steer + Drive)"
      : gridMode === "hyd"
        ? "Hydraulic brake corner grid (LF / RF / LR / RR)"
        : "No corner grid";

  const dutyLabel =
    dutyClass === "light" ? "Light duty" : dutyClass === "medium" ? "Medium duty" : "Heavy duty";

  const totalSelected = useMemo(
    () => Object.values(selections).reduce((sum, arr) => sum + (arr?.length ?? 0), 0),
    [selections],
  );

  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      cur.has(item) ? cur.delete(item) : cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  function selectAllInSection(sectionTitle: string, items: Array<{ item: string }>) {
    setSelections((prev) => ({
      ...prev,
      [sectionTitle]: items.map((i) => i.item),
    }));
  }
  function clearSection(sectionTitle: string) {
    setSelections((prev) => ({ ...prev, [sectionTitle]: [] }));
  }
  function selectAllEverywhere() {
    const next: Record<string, string[]> = {};
    for (const sec of masterInspectionList) {
      next[sec.title] = sec.items.map((i) => i.item);
    }
    setSelections(next);
  }
  function clearAll() {
    setSelections({});
  }

  function toggleSectionCollapsed(sectionTitle: string) {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionTitle]: !prev[sectionTitle],
    }));
  }

  // Oil change section
  function buildOilSection(engine: EngineType): Section {
    return {
      title: engine === "diesel" ? "Oil Change (Diesel)" : "Oil Change (Gas)",
      items: [{ item: "Drain and fill engine oil" }, { item: "Replace oil filter" }],
    };
  }

  // Grease chassis section
  function buildGreaseChassisSection(): Section {
    return {
      title: "Grease Chassis",
      items: [{ item: "Grease chassis" }],
    };
  }

  /**
   * Stage into `inspection:*` keys and route into `/inspections/run`
   * (Canonical runtime keys only — avoids builder-mode bleed)
   */
  function goToRunWithSections(sections: Section[] | unknown, tplTitle: string) {
    const base = Array.isArray(sections) ? (sections as Section[]) : [];

    let finalSections = prepareSections(
      base,
      gridMode,
      includeTireGrid,
      includeBatteryGrid,
      batteryCount,
    );

    // Inject Grease Chassis at end if enabled
    if (
      includeGreaseChassis &&
      !finalSections.some((s) => normalizeTitle(s.title) === "grease chassis")
    ) {
      finalSections = [...finalSections, buildGreaseChassisSection()];
    }

    // Canonical runtime keys ONLY
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

    // Remove builder keys
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
      }),
    );

    router.push(`/inspections/run?${qs.toString()}`);
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

  async function buildFromPrompt() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch("/api/inspections/build-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, dutyClass }),
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

  return (
    <div className="p-4 text-white">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-black/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-6">
        <h1
          className="mb-3 text-center text-2xl font-bold tracking-[0.18em] text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          Build Custom Inspection
        </h1>

        <div className="mb-5 rounded-2xl border border-white/10 bg-black/70 px-3 py-3 text-xs text-neutral-200 md:flex md:items-center md:justify-between md:px-4">
          <div className="space-y-1 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-1 md:space-y-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Duty</span>
              <span className="rounded-full bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-300">
                {dutyLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Corner Grid</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                {gridModeLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Tire Grid</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                {includeTireGrid ? "Enabled" : "Off"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Oil</span>
              <span className="rounded-full bg-zinc-700/60 px-2 py-1 text-[11px] font-semibold text-zinc-100">
                {includeOil ? `Included (${oilEngineType.toUpperCase()})` : "No oil section"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Grease</span>
              <span className="rounded-full bg-lime-500/10 px-2 py-1 text-[11px] font-semibold text-lime-200">
                {includeGreaseChassis ? "Chassis enabled" : "Off"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Batteries</span>
              <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
                {includeBatteryGrid ? `Battery grid enabled (${batteryCount})` : "No battery grid"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Hours</span>
              <span className="rounded-full bg-neutral-800/80 px-2 py-1 text-[11px] font-semibold text-neutral-100">
                {laborHours.trim() ? laborHours.trim() : "—"}
              </span>
            </span>
          </div>

          <div className="mt-2 text-[11px] text-neutral-400 md:mt-0">
            Selected items:{" "}
            <span className="font-semibold text-neutral-100">{totalSelected}</span>
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-sm text-neutral-300">Template title</span>
            <input
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-sm text-neutral-300">Duty Class</span>
              <select
                className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                value={dutyClass}
                onChange={(e) => setDutyClass(e.target.value as DutyClass)}
              >
                <option value="light">Light</option>
                <option value="medium">Medium</option>
                <option value="heavy">Heavy</option>
              </select>

              <span className="mt-1 text-[11px] text-neutral-400">
                Duty class influences suggested items. Corner grid is chosen below.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-sm text-neutral-300">Labor hours</span>
              <input
                inputMode="decimal"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                value={laborHours}
                onChange={(e) => setLaborHours(e.target.value)}
                placeholder="e.g. 2.5"
              />
              <span className="mt-1 text-[11px] text-neutral-500">
                Optional. Stored in inspection params for downstream use.
              </span>
            </label>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIncludeOil((v) => !v)}
            className={
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]" +
              " " +
              (includeOil
                ? "bg-emerald-500 text-black shadow-[0_0_18px_rgba(16,185,129,0.6)]"
                : "border border-zinc-600 bg-zinc-800/80 text-white hover:bg-zinc-700")
            }
          >
            {includeOil ? "Oil Change Section: ON" : "Oil Change Section: OFF"}
          </button>

          {includeOil && (
            <div className="flex items-center gap-2 rounded-full border border-neutral-700 bg-black/70 px-3 py-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">Engine</span>
              <select
                className="rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1 text-[12px] text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
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
            className={
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]" +
              " " +
              (includeTireGrid
                ? "bg-amber-400 text-black shadow-[0_0_18px_rgba(251,191,36,0.55)]"
                : "border border-zinc-600 bg-zinc-800/80 text-white hover:bg-zinc-700")
            }
          >
            {includeTireGrid ? "Tire Grid: ON" : "Tire Grid: OFF"}
          </button>

          <button
            type="button"
            onClick={() => setIncludeGreaseChassis((v) => !v)}
            className={
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]" +
              " " +
              (includeGreaseChassis
                ? "bg-lime-400 text-black shadow-[0_0_18px_rgba(163,230,53,0.55)]"
                : "border border-zinc-600 bg-zinc-800/80 text-white hover:bg-zinc-700")
            }
          >
            {includeGreaseChassis ? "Grease Chassis: ON" : "Grease Chassis: OFF"}
          </button>

          <button
            type="button"
            onClick={() => setIncludeBatteryGrid((v) => !v)}
            className={
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]" +
              " " +
              (includeBatteryGrid
                ? "bg-sky-500 text-black shadow-[0_0_18px_rgba(56,189,248,0.6)]"
                : "border border-zinc-600 bg-zinc-800/80 text-white hover:bg-zinc-700")
            }
          >
            {includeBatteryGrid ? "Battery Grid: ON" : "Battery Grid: OFF"}
          </button>

          {includeBatteryGrid && (
            <div className="flex items-center gap-2 rounded-full border border-neutral-700 bg-black/70 px-3 py-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                Count
              </span>
              <select
                className="rounded-full border border-neutral-700 bg-neutral-900/80 px-3 py-1 text-[12px] text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                value={String(batteryCount)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setBatteryCount(Number.isFinite(next) ? next : 2);
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
            Corner grid mode
          </span>
          {([
            { value: "hyd", label: "Hydraulic" },
            { value: "air", label: "Air" },
            { value: "none", label: "None" },
          ] as const).map((opt) => {
            const active = gridMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setGridTouched(true);
                  setGridMode(opt.value);
                }}
                className={
                  "rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]" +
                  " " +
                  (active
                    ? "bg-[linear-gradient(to_right,var(--accent-copper-soft,#e17a3e),var(--accent-copper,#f97316))] text-black shadow-[0_0_18px_rgba(212,118,49,0.6)]"
                    : "border border-neutral-700 bg-black/70 text-neutral-100 hover:bg-black/80")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* AI builder */}
        <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-950/90 p-4">
          <div className="mb-2 text-center font-semibold text-orange-400">
            Build with AI (optional)
          </div>
          <p className="mb-2 text-center text-sm text-neutral-300">
            Describe what you want to inspect. We’ll generate sections &amp; items.
          </p>
          <textarea
            className="mb-3 min-h-[90px] w-full rounded-xl border border-neutral-700 bg-neutral-900/80 p-3 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
            placeholder="e.g. 60-point commercial truck inspection with air brakes, suspension, steering, lighting, and undercarriage."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />

          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            {[
              "60-point light-duty car inspection with focus on tires, brakes, and fluids.",
              "Heavy-duty highway tractor with air brakes, suspension, steering, lighting, and batteries.",
              "Fleet trailer annual inspection including brakes, tires, frame, lighting, and battery checks.",
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setAiPrompt(sample)}
                className="rounded-full border border-orange-500/50 bg-orange-500/10 px-3 py-1 text-[11px] text-orange-200 hover:bg-orange-500/20"
              >
                Use sample
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={buildFromPrompt}
              disabled={aiLoading || !aiPrompt.trim()}
              className="rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {aiLoading ? "Generating…" : "Build from AI Prompt"}
            </button>
            {aiError ? <span className="text-xs text-red-400">{aiError}</span> : null}
          </div>
        </div>

        {/* Bulk actions */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-400">
          <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
            Global manual actions
          </span>
          <button
            type="button"
            onClick={selectAllEverywhere}
            className="rounded-full bg-zinc-800 px-3 py-1 text-[11px] text-white hover:bg-zinc-700"
          >
            Select all (all sections)
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] text-white hover:bg-zinc-800"
          >
            Clear all
          </button>
        </div>

        {/* Manual pick list */}
        <div className="mb-8 space-y-4">
          {masterInspectionList.map((sec) => {
            const selectedCount = selections[sec.title]?.length ?? 0;
            const collapsed = collapsedSections[sec.title] ?? false;

            return (
              <div
                key={sec.title}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.85)]"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-orange-300">{sec.title}</div>
                    <span className="rounded-full bg-zinc-800 px-2 py-[2px] text-[11px] text-zinc-300">
                      {selectedCount}/{sec.items.length} selected
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllInSection(sec.title, sec.items)}
                      className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] text-white hover:bg-zinc-700"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSection(sec.title)}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-white hover:bg-zinc-800"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapsed(sec.title)}
                      className="rounded-full border border-neutral-600 bg-black/70 px-3 py-1 text-[11px] text-neutral-100 hover:bg-neutral-800"
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
                          className="flex items-center gap-2 rounded-lg bg-black/60 px-2 py-1 text-sm text-neutral-100"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(sec.title, label)}
                            className="h-4 w-4 accent-orange-500"
                          />
                          <span className="text-xs sm:text-sm">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {collapsed && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Section collapsed. Expand to adjust individual checks.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={startManual}
            className="rounded-full bg-orange-600 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black hover:bg-orange-500"
          >
            Start Inspection (Manual)
          </button>
          <button
            onClick={buildFromPrompt}
            disabled={aiLoading || !aiPrompt.trim()}
            className="rounded-full bg-indigo-600 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {aiLoading ? "Generating…" : "Start with AI"}
          </button>
        </div>
      </div>
    </div>
  );
}