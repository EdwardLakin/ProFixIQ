// features/inspections/app/inspection/custom-inspection/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type VehicleType = "car" | "truck" | "bus" | "trailer";

// Minimal shape we care about when merging
type Section = {
  title: string;
  items: Array<{ item?: string; name?: string; unit?: string | null }>;
};

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Prefills
  const [vehicleType, setVehicleType] = useState<VehicleType>("truck");
  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");

  // Manual builder state
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [services, setServices] = useState<string[]>([]);
  const [includeAxle, setIncludeAxle] = useState(true);
  const [includeOil, setIncludeOil] = useState(true);

  // AI builder state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  /* ------------------------------- helpers ------------------------------- */
  const toggle = (section: string, item: string) =>
    setSelections((prev) => {
      const cur = new Set(prev[section] ?? []);
      cur.has(item) ? cur.delete(item) : cur.add(item);
      return { ...prev, [section]: [...cur] };
    });

  const toggleService = (item: string) =>
    setServices((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );

  // ---- Select-all helpers (NEW) ----
  function selectAllInSection(sectionTitle: string, items: { item: string }[]) {
    setSelections((prev) => ({ ...prev, [sectionTitle]: items.map((i) => i.item) }));
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

  function goToRunWithSections(sections: unknown, tplTitle: string) {
    // /inspections/custom-draft reads these from sessionStorage
    sessionStorage.setItem("customInspection:sections", JSON.stringify(sections));
    sessionStorage.setItem("customInspection:title", tplTitle);
    sessionStorage.setItem("customInspection:includeOil", JSON.stringify(includeOil));

    // Keep any existing URL params (e.g., customer/vehicle), and add vehicleType/template
    const qs = new URLSearchParams(sp.toString());
    qs.set("vehicleType", vehicleType);
    qs.set("template", tplTitle);
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

    // drop empty sections
    return Object.values(out).filter((s) => (s.items?.length ?? 0) > 0);
  }

  /** Oil block used when the toggle is on (only added if not already present) */
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
    const built = buildInspectionFromSelections({
      selections,
      axle: includeAxle ? { vehicleType } : null,
      extraServiceItems: services,
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
      const res = await fetch("/api/inspections/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, vehicleType }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Generate failed (${res.status})`);
      }
      const { sections: aiSections } = (await res.json()) as { sections: Section[] };

      // Manual from current toggles
      const manualBuilt = buildInspectionFromSelections({
        selections,
        axle: includeAxle ? { vehicleType } : null,
        extraServiceItems: services,
      }) as unknown as Section[];

      // Ensure Oil section if toggle is on
      const base =
        includeOil &&
        !aiSections.some((s) => normalizeTitle(s.title) === "oil change") &&
        !manualBuilt.some((s) => normalizeTitle(s.title) === "oil change")
          ? [...aiSections, buildOilSection()]
          : aiSections;

      // Merge AI + Manual selections
      const merged = mergeSections(base, manualBuilt);

      goToRunWithSections(merged, title || "AI Inspection");
    } catch (e: any) {
      setAiError(e?.message || "Failed to generate inspection.");
    } finally {
      setAiLoading(false);
    }
  }

  /* ---------------------------------- UI ---------------------------------- */
  return (
    <div className="p-4 text-white">
      <h1 className="mb-3 text-2xl font-bold">Build Custom Inspection</h1>

      {/* Title + Vehicle type */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Title</span>
          <input
            className="rounded bg-neutral-800 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Vehicle Type (axle layout)</span>
          <select
            className="rounded bg-neutral-800 px-3 py-2"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
          >
            <option value="car">Car (Hydraulic)</option>
            <option value="truck">Truck (Air)</option>
            <option value="bus">Bus (Air)</option>
            <option value="trailer">Trailer (Air)</option>
          </select>
        </label>
      </div>

      {/* Toggles */}
      <div className="mb-6 flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeAxle}
            onChange={(e) => setIncludeAxle(e.target.checked)}
          />
        <span>Include Axle Block</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeOil}
            onChange={(e) => setIncludeOil(e.target.checked)}
          />
          <span>Append Oil Change Section</span>
        </label>
      </div>

      {/* ------------------------------- AI builder ------------------------------- */}
      <div className="mb-8 rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Build with AI (optional)</div>
        <p className="mb-2 text-sm text-neutral-300">
          Describe what you want to inspect (vehicle system, depth, measurements, compliance, etc.).
          We’ll generate sections &amp; items you can run immediately.
        </p>
        <textarea
          className="mb-3 min-h-[90px] w-full rounded bg-neutral-800 p-3"
          placeholder="e.g. CVIP pre-trip for 5-axle tractor with emphasis on air brakes, tread depth, lighting, and documentation checks."
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={buildFromPrompt}
            disabled={aiLoading || !aiPrompt.trim()}
            className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {aiLoading ? "Generating…" : "Build from AI Prompt"}
          </button>
          {aiError ? <span className="text-sm text-red-400">{aiError}</span> : null}
        </div>
      </div>

      {/* -------- Global bulk actions for manual pick list (NEW) -------- */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-400">Bulk actions:</span>
        <button
          type="button"
          onClick={selectAllEverywhere}
          className="rounded bg-zinc-700 px-3 py-1 text-xs text-white hover:bg-zinc-600"
        >
          Select all (all sections)
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded bg-zinc-800 px-3 py-1 text-xs text-white hover:bg-zinc-700"
        >
          Clear all
        </button>
      </div>

      {/* ----------------------------- Manual pick list ----------------------------- */}
      <div className="mb-8 space-y-4">
        {masterInspectionList.map((sec) => {
          const selectedCount = (selections[sec.title]?.length ?? 0);
          return (
            <div
              key={sec.title}
              className="rounded border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold text-orange-400">
                  {sec.title}
                  <span className="ml-2 rounded bg-zinc-800 px-2 py-[2px] text-[11px] text-zinc-300">
                    {selectedCount}/{sec.items.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectAllInSection(sec.title, sec.items)}
                    className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-zinc-600"
                    title="Select all items in this section"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => clearSection(sec.title)}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-white hover:bg-zinc-700"
                    title="Clear this section"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sec.items.map((i) => {
                  const checked = (selections[sec.title] ?? []).includes(i.item);
                  return (
                    <label key={i.item} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(sec.title, i.item)}
                      />
                      <span>{i.item}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional service add-ons */}
      <div className="mb-8 rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Service Items</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {masterServicesList.flatMap((cat) =>
            cat.items.map((i) => (
              <label key={i.item} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={services.includes(i.item)}
                  onChange={() => toggleService(i.item)}
                />
                <span>{i.item}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={startManual}
          className="rounded bg-orange-600 px-4 py-2 font-semibold text-black hover:bg-orange-500"
        >
          Start Inspection (Manual)
        </button>
        <button
          onClick={buildFromPrompt}
          disabled={aiLoading || !aiPrompt.trim()}
          className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          title="Use AI prompt above"
        >
          {aiLoading ? "Generating…" : "Start with AI"}
        </button>
      </div>
    </div>
  );
}
