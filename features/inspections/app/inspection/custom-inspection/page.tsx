//features/inspections/app/inspection/custom-inspection/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";

type DutyClass = "light" | "medium" | "heavy";

// Minimal shape we care about when merging
type Section = {
  title: string;
  items: Array<{ item?: string; name?: string; unit?: string | null }>;
};

export default function CustomBuilderPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Prefills
  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [dutyClass, setDutyClass] = useState<DutyClass>("heavy");

  // Manual builder state
  const [selections, setSelections] = useState<Record<string, string[]>>({});
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

  function goToRunWithSections(sections: Section[] | unknown, tplTitle: string) {
    // legacy keys so unified custom-draft can read them
    sessionStorage.setItem("customInspection:sections", JSON.stringify(sections));
    sessionStorage.setItem("customInspection:title", tplTitle);
    sessionStorage.setItem(
      "customInspection:includeOil",
      JSON.stringify(includeOil),
    );
    sessionStorage.setItem("customInspection:dutyClass", dutyClass);

    const qs = new URLSearchParams(sp.toString());
    qs.set("template", tplTitle);
    qs.set("dutyClass", dutyClass);

    // 🔁 NEW: go through unified custom draft
    router.push(`/inspections/unified/custom-draft?${qs.toString()}`);
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
      includeOil &&
      !built.some((s) => normalizeTitle(s.title) === "oil change")
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
    <div className="bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),#020617_90%)] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_22px_55px_rgba(0,0,0,0.95)] backdrop-blur">
        <h1 className="mb-3 text-center text-2xl font-blackops uppercase tracking-[0.18em] text-orange-400">
          Build Custom Inspection
        </h1>

        {/* Title + Duty class */}
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Title
            </span>
            <input
              className="w-full rounded-lg border border-white/10 bg-neutral-900/80 px-3 py-2 text-sm shadow-[0_0_24px_rgba(15,23,42,0.9)] focus:outline-none focus:ring-2 focus:ring-orange-500/80"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-center md:text-left">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Duty Class
            </span>
            <select
              className="rounded-lg border border-white/10 bg-neutral-900/80 px-3 py-2 text-sm shadow-[0_0_24px_rgba(15,23,42,0.9)] focus:outline-none focus:ring-2 focus:ring-orange-500/80"
              value={dutyClass}
              onChange={(e) => setDutyClass(e.target.value as DutyClass)}
            >
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>
        </div>

        {/* Oil button */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIncludeOil((v) => !v)}
            className={
              "rounded-full px-4 py-2 text-xs font-semibold tracking-wide shadow-[0_0_24px_rgba(16,185,129,0.45)] transition " +
              (includeOil
                ? "border border-emerald-400/80 bg-emerald-500 text-black hover:bg-emerald-400"
                : "border border-zinc-600/70 bg-zinc-900 text-white hover:bg-zinc-800")
            }
          >
            {includeOil
              ? "Remove Oil Change Section"
              : "Add Oil Change Section"}
          </button>
        </div>

        {/* AI builder */}
        <div className="mb-8 rounded-2xl border border-neutral-800/90 bg-gradient-to-br from-neutral-950 via-neutral-950 to-slate-950 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.9)]">
          <div className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
            Build with AI (optional)
          </div>
          <p className="mb-3 text-center text-[11px] text-neutral-300">
            Describe what you want to inspect. We’ll generate sections &amp;
            items and send them into the unified inspection editor.
          </p>
          <textarea
            className="mb-3 min-h-[100px] w-full rounded-xl border border-white/10 bg-neutral-900/80 p-3 text-sm text-neutral-100 shadow-[0_0_30px_rgba(15,23,42,0.95)] focus:outline-none focus:ring-2 focus:ring-orange-500/70"
            placeholder="e.g. 60-point commercial truck inspection with air brakes, suspension, steering, lighting, and undercarriage."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={buildFromPrompt}
              disabled={aiLoading || !aiPrompt.trim()}
              className="rounded-full border border-indigo-400/80 bg-indigo-500 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-[0_0_26px_rgba(129,140,248,0.6)] hover:bg-indigo-400 disabled:opacity-60"
            >
              {aiLoading ? "Generating…" : "Build from AI Prompt"}
            </button>
            {aiError ? (
              <span className="text-xs text-red-400">{aiError}</span>
            ) : null}
          </div>
        </div>

        {/* Bulk actions */}
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-neutral-400">
          <span className="uppercase tracking-[0.16em]">Bulk actions</span>
          <button
            type="button"
            onClick={selectAllEverywhere}
            className="rounded-full border border-zinc-600/80 bg-zinc-900 px-3 py-1 text-[11px] text-white hover:bg-zinc-800"
          >
            Select all (all sections)
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full border border-zinc-700/80 bg-zinc-950 px-3 py-1 text-[11px] text-white hover:bg-zinc-900"
          >
            Clear all
          </button>
        </div>

        {/* Manual pick list */}
        <div className="mb-8 space-y-4">
          {masterInspectionList.map((sec) => {
            const selectedCount = selections[sec.title]?.length ?? 0;
            return (
              <div
                key={sec.title}
                className="rounded-2xl border border-neutral-800/90 bg-neutral-950/80 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.85)]"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-semibold text-orange-400">
                    {sec.title}
                    <span className="ml-2 rounded-full bg-zinc-900 px-2 py-[2px] text-[10px] text-zinc-300">
                      {selectedCount}/{sec.items.length}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        selectAllInSection(sec.title, sec.items)
                      }
                      className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-white hover:bg-zinc-700"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSection(sec.title)}
                      className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] text-white hover:bg-zinc-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {sec.items.map((i) => {
                    const checked =
                      (selections[sec.title] ?? []).includes(i.item);
                    return (
                      <label
                        key={i.item}
                        className="flex items-center gap-2 rounded-lg bg-neutral-900/70 px-2 py-1 text-sm text-neutral-100"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(sec.title, i.item)}
                          className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
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

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={startManual}
            className="rounded-full border border-orange-400/90 bg-orange-500 px-4 py-2 text-xs font-semibold tracking-wide text-black shadow-[0_0_26px_rgba(249,115,22,0.7)] hover:bg-orange-400"
          >
            Start Inspection (Manual)
          </button>
          <button
            onClick={buildFromPrompt}
            disabled={aiLoading || !aiPrompt.trim()}
            className="rounded-full border border-indigo-400/80 bg-indigo-500 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-[0_0_26px_rgba(129,140,248,0.6)] hover:bg-indigo-400 disabled:opacity-60"
          >
            {aiLoading ? "Generating…" : "Start with AI"}
          </button>
        </div>
      </div>
    </div>
  );
}