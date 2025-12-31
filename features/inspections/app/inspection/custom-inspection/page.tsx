// features/inspecctions/app/inspection/custom-inspection/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";

type DutyClass = "light" | "medium" | "heavy";
type GridMode = "hyd" | "air" | "none";

// Minimal shape we care about when merging
type Section = {
  title: string;
  items: Array<{ item?: string; name?: string; unit?: string | null }>;
};

/* ------------------------------------------------------------------ */
/* Corner-grid detection + builders (aligned with run/mobile)         */
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

/** Remove any section that appears to be a corner grid to prevent duplicates. */
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
  const items: { item: string; unit: string | null }[] = [];
  for (const c of corners) {
    for (const m of metrics) {
      items.push({ item: `${c} ${m.label}`, unit: m.unit });
    }
  }
  return { title: "Corner Grid (Hydraulic)", items };
}

/** Canonical AIR corner grid: Steer 1 + Drive 1 with explicit Inner/Outer where needed */
function buildAirCornerSection(): Section {
  const steer: { item: string; unit: string | null }[] = [
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

  const drive: { item: string; unit: string | null }[] = [
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
/* Battery grid helpers (for BatteryGrid)                             */
/* ------------------------------------------------------------------ */

/** Do we already have any battery-style section/items? */
function hasBatterySection(sections: Section[] | unknown): boolean {
  const s = Array.isArray(sections) ? (sections as Section[]) : [];
  return s.some((sec) => {
    const title = (sec.title || "").toLowerCase();
    if (title.includes("battery")) return true;
    return (sec.items ?? []).some((raw) =>
      (raw.item ?? raw.name ?? "").toLowerCase().includes("battery"),
    );
  });
}

/** Canonical battery grid that matches BatteryGrid’s BATTERY_RE pattern */
function buildBatterySection(): Section {
  const metrics: Array<{ label: string; unit: string | null }> = [
    { label: "Rating CCA", unit: "CCA" },  // ← will be classified as rating
    { label: "Tested CCA", unit: "CCA" },  // ← will be classified as tested
    { label: "Voltage", unit: "V" },
    { label: "State of Health", unit: "%" },
    { label: "State of Charge", unit: "%" },
    { label: "Visual Condition", unit: "" },
  ];

  // Adjust battery count if you want more/less
  const batteries = ["Battery 1", "Battery 2"];

  const items: { item: string; unit: string | null }[] = [];
  for (const b of batteries) {
    for (const m of metrics) {
      items.push({ item: `${b} ${m.label}`, unit: m.unit });
    }
  }

  return { title: "Battery Grid", items };
}

/**
 * Deterministic corner-grid injector:
 * - If user/template already has a corner-grid-like title -> leave sections as-is.
 * - Else strip pattern-based corner grids, then inject based on gridParam:
 *   - "air"  → air corner grid
 *   - "hyd"  → hydraulic corner grid
 *   - "none" → no corner grid injected
 *   - "" / null → infer from vehicleType (kept for backward-compat).
 */
function prepareSectionsWithCornerGrid(
  sections: Section[] | unknown,
  vehicleType: string | null | undefined,
  gridParam: GridMode | "" | null,
): Section[] {
  const s = Array.isArray(sections) ? (sections as Section[]) : [];

  // 1) If there is already a corner-style title, trust the template
  const hasCornerByTitle = s.some((sec) => looksLikeCornerTitle(sec.title));
  if (hasCornerByTitle) return s;

  // 2) Otherwise, strip out any corner-looking item patterns
  const withoutGrids = stripExistingCornerGrids(s);
  const gridMode = (gridParam || "").toLowerCase() as GridMode | "";

  if (gridMode === "none") return withoutGrids;

  // 3) Decide air vs hyd
  let injectAir: boolean;
  if (gridMode === "air" || gridMode === "hyd") {
    // Explicit override wins
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

  const injected = injectAir
    ? buildAirCornerSection()
    : buildHydraulicCornerSection();

  return [injected, ...withoutGrids];
}

/* ------------------------------------------------------------------ */

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Prefills
  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [dutyClass, setDutyClass] = useState<DutyClass>("heavy");

  // Manual corner-grid mode (Hyd / Air / None)
  const [gridMode, setGridMode] = useState<GridMode>(
    dutyClass === "heavy" ? "air" : "hyd",
  );

  // Manual builder state
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [includeOil, setIncludeOil] = useState(true);
  const [includeBatteryGrid, setIncludeBatteryGrid] = useState(false);

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  // AI builder state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  /* --------------------------- derived helpers --------------------------- */

  const gridModeLabel =
    gridMode === "air"
      ? "Air brake corner grid (Steer + Drive)"
      : gridMode === "hyd"
        ? "Hydraulic brake corner grid (LF / RF / LR / RR)"
        : "No corner grid";

  const dutyLabel =
    dutyClass === "light"
      ? "Light duty"
      : dutyClass === "medium"
        ? "Medium duty"
        : "Heavy duty";

  const totalSelected = Object.values(selections).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0,
  );

  /* ------------------------------- helpers ------------------------------- */
  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      cur.has(item) ? cur.delete(item) : cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  // ---- Select-all helpers ----
  function selectAllInSection(sectionTitle: string, items: { item: string }[]) {
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

  function goToRunWithSections(sections: Section[] | unknown, tplTitle: string) {
    // Inject the appropriate corner grid now, so the runtime just renders it.
    const withGrid = prepareSectionsWithCornerGrid(
      sections,
      dutyClass, // still used for inference if gridMode is ""
      gridMode,
    );

    // Optionally inject battery grid (only if there isn't already a battery section)
    const withBattery =
      includeBatteryGrid && !hasBatterySection(withGrid)
        ? [...withGrid, buildBatterySection()]
        : withGrid;

    // Persist for downstream loaders/runtime
    sessionStorage.setItem(
      "customInspection:sections",
      JSON.stringify(withBattery),
    );
    sessionStorage.setItem("customInspection:title", tplTitle);
    sessionStorage.setItem(
      "customInspection:includeOil",
      JSON.stringify(includeOil),
    );
    sessionStorage.setItem("customInspection:dutyClass", dutyClass);
    sessionStorage.setItem(
      "customInspection:includeBatteryGrid",
      JSON.stringify(includeBatteryGrid),
    );
    sessionStorage.setItem("customInspection:gridMode", gridMode);

    const qs = new URLSearchParams(sp.toString());
    qs.set("template", tplTitle);
    qs.set("dutyClass", dutyClass);
    qs.set("grid", gridMode); // explicit hint for any downstream grid-aware logic

    router.push(`/inspections/custom-draft?${qs.toString()}`);
  }

  // Normalization + merge helpers
  function normalizeTitle(t: string) {
    return (t || "").trim().toLowerCase();
  }
  function normalizeItem(i: string) {
    return (i || "").trim().toLowerCase();
  }
  function toLabel(raw: { item?: string; name?: string }) {
    return (raw.item ?? raw.name ?? "").trim();
  }

  /** Merge two section lists, de-duping by title + item label */
  function mergeSections(a: Section[], b: Section[]): Section[] {
    const out: Record<
      string,
      { title: string; items: { item: string; unit?: string | null }[] }
    > = {};

    const addList = (list: Section[]) => {
      for (const sec of list || []) {
        const title = sec?.title ?? "";
        const key = normalizeTitle(title);
        if (!key) continue;
        if (!out[key]) out[key] = { title, items: [] };
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

    // drop genuinely empty sections
    return Object.values(out).filter((s) => (s.items?.length ?? 0) > 0);
  }

  /** Oil block (only added if toggle on and not already present) */
  function buildOilSection(): Section {
    return {
      title: "Oil Change",
      items: [
        { item: "Drain engine oil" },
        { item: "Replace oil filter" },
        { item: "Refill with correct viscosity" },
        { item: "Reset maintenance reminder" },
        { item: "Inspect for leaks after start" },
      ],
    };
  }

  /* ------------------------- Manual: Start Inspection ------------------------- */
  function startManual() {
    // no axle, no vehicle type — just what the user picked
    const built = buildInspectionFromSelections({
      selections,
      extraServiceItems: [],
    }) as unknown as Section[];

    const withOil =
      includeOil && !built.some((s) => normalizeTitle(s.title) === "oil change")
        ? [...built, buildOilSection()]
        : built;

    goToRunWithSections(withOil, title);
  }

  /* --------------------------- AI: Build from prompt -------------------------- */
  async function buildFromPrompt() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/inspections/build-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          dutyClass,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Generate failed (${res.status})`);
      }

      const { sections: aiSections } = (await res.json()) as {
        sections: Section[];
      };

      // also mix in anything the user manually ticked
      const manualBuilt = buildInspectionFromSelections({
        selections,
        extraServiceItems: [],
      }) as unknown as Section[];

      // add oil if neither side has it
      const base =
        includeOil &&
        !aiSections.some((s) => normalizeTitle(s.title) === "oil change") &&
        !manualBuilt.some((s) => normalizeTitle(s.title) === "oil change")
          ? [...aiSections, buildOilSection()]
          : aiSections;

      const merged = mergeSections(base, manualBuilt);

      // final safety: drop any empty sections so the runtime doesn’t render blank blocks
      const cleaned = merged.filter(
        (s) => Array.isArray(s.items) && s.items.length > 0,
      );

      goToRunWithSections(cleaned, title || "AI Inspection");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to generate inspection.";
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="p-4 text-white">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-black/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl md:p-6">
        {/* Title */}
        <h1
          className="mb-3 text-center text-2xl font-bold tracking-[0.18em] text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
        >
          Build Custom Inspection
        </h1>

        {/* Summary strip */}
        <div className="mb-5 rounded-2xl border border-white/10 bg-black/70 px-3 py-3 text-xs text-neutral-200 md:flex md:items-center md:justify-between md:px-4">
          <div className="space-y-1 md:space-y-0 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Duty
              </span>
              <span className="rounded-full bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-300">
                {dutyLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Corner Grid
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                {gridModeLabel}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Oil
              </span>
              <span className="rounded-full bg-zinc-700/60 px-2 py-1 text-[11px] font-semibold text-zinc-100">
                {includeOil ? "Oil change section included" : "No oil section"}
              </span>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                Batteries
              </span>
              <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
                {includeBatteryGrid ? "Battery grid enabled" : "No battery grid"}
              </span>
            </span>
          </div>

          <div className="mt-2 text-[11px] text-neutral-400 md:mt-0">
            Selected items:{" "}
            <span className="font-semibold text-neutral-100">
              {totalSelected}
            </span>
          </div>
        </div>

        {/* Title + Duty class */}
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-sm text-neutral-300">Template title</span>
            <input
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-sm text-neutral-300">Duty Class</span>
            <select
              className="rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
              value={dutyClass}
              onChange={(e) =>
                setDutyClass(e.target.value as DutyClass)
              }
            >
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="heavy">Heavy</option>
            </select>

            <span className="mt-1 text-[11px] text-neutral-400">
              Duty class influences which CVIP/master items are suggested.
              Corner grid style is chosen separately below.
            </span>
          </label>
        </div>

        {/* Toggles: Oil + Battery */}
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
            {includeBatteryGrid
              ? "Battery Grid: ON"
              : "Battery Grid: OFF"}
          </button>
        </div>

        {/* Corner grid mode selector */}
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
                onClick={() => setGridMode(opt.value)}
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
            Describe what you want to inspect. We’ll generate sections &amp; items
            and send them to the editor. Duty class &amp; corner grid mode are
            respected.
          </p>
          <textarea
            className="mb-3 min-h-[90px] w-full rounded-xl border border-neutral-700 bg-neutral-900/80 p-3 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
            placeholder="e.g. 60-point commercial truck inspection with air brakes, suspension, steering, lighting, and undercarriage."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />

          {/* Sample prompt chips */}
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
            {aiError ? (
              <span className="text-xs text-red-400">{aiError}</span>
            ) : null}
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
                    <div className="font-semibold text-orange-300">
                      {sec.title}
                    </div>
                    <span className="rounded-full bg-zinc-800 px-2 py-[2px] text-[11px] text-zinc-300">
                      {selectedCount}/{sec.items.length} selected
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        selectAllInSection(sec.title, sec.items as any)
                      }
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
                      const checked = (selections[sec.title] ?? []).includes(
                        label,
                      );
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

        {/* Actions */}
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