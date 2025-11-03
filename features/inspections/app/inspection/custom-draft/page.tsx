"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { InspectionSection, InspectionItem } from "@inspections/lib/inspection/types";
import { computeDefaultLaborHours } from "@inspections/lib/inspection/computeLabor";
import toast from "react-hot-toast";

/**
 * Editable Draft Screen
 * - Edit section titles
 * - Add / remove / reorder sections
 * - Add / edit / remove items
 * - Optional unit per item (mm, psi, kPa, in, ft·lb, blank)
 * - Editable labor hours (defaulted via computeLaborHours)
 */

const UNIT_OPTIONS = ["", "mm", "psi", "kPa", "in", "ft·lb"] as const;

type VehicleType = "car" | "truck" | "bus" | "trailer";

/** Narrow Insert type to include labor_hours until your generated types include it */
type InsertTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Insert"] & {
    labor_hours?: number | null;
  };

/* ---------------------------- safe type helpers ---------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeItemLike(i: unknown): {
  item: string;
  unit: InspectionItem["unit"];
  status: InspectionItem["status"] | undefined;
  notes: InspectionItem["notes"] | undefined;
} {
  if (!isRecord(i)) {
    return { item: "", unit: null, status: "na", notes: "" };
  }
  // accept either `item` or `name` for label
  const label = asString(i.item ?? i.name).trim();
  const unit = (isRecord(i) ? (i.unit as InspectionItem["unit"]) : null) ?? null;

  const rawStatus = isRecord(i) ? i.status : undefined;
  const status: InspectionItem["status"] | undefined =
    rawStatus === "ok" || rawStatus === "fail" || rawStatus === "na" || rawStatus === "recommend"
      ? rawStatus
      : "na";

  const notes = asNullableString(isRecord(i) ? i.notes : null) ?? "";

  return { item: label, unit, status, notes };
}

/** Merge sections by title & dedupe items by label (case-insensitive) */
function normalizeSections(input: unknown): InspectionSection[] {
  if (!Array.isArray(input)) return [];
  const byTitle = new Map<string, InspectionSection>();

  for (const s of input) {
    if (!isRecord(s)) continue;
    const title = asString(s.title).trim();
    if (!title) continue;

    const itemsRaw = Array.isArray(s.items) ? (s.items as unknown[]) : [];
    const items = itemsRaw
      .map((it) => normalizeItemLike(it))
      .filter((it) => it.item.length > 0);

    if (!byTitle.has(title)) {
      byTitle.set(title, { title, items: [] });
    }
    const bucket = byTitle.get(title)!;
    const seen = new Set((bucket.items ?? []).map((x) => (x.item ?? "").toLowerCase()));

    for (const it of items) {
      const key = (it.item ?? "").toLowerCase();
      if (!seen.has(key)) {
        bucket.items = [...(bucket.items ?? []), it];
        seen.add(key);
      }
    }
  }

  return Array.from(byTitle.values()).filter((s) => (s.items?.length ?? 0) > 0);
}

/* ——— helpers ——— */
function buildOilChangeSection(): InspectionSection {
  return {
    title: "Oil Change",
    items: [
      { item: "Drain engine oil", status: "na" },
      { item: "Replace oil filter", status: "na" },
      { item: "Oil Capacity", status: "na" },
      { item: "Reset maintenance reminder", status: "na" },
      { item: "Inspect for leaks after start", status: "na" },
    ],
  };
}

/* -------------------------------- component -------------------------------- */

export default function CustomDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [vehicleType] = useState<VehicleType | null>(
    (sp.get("vehicleType") as VehicleType | null) || null
  );

  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [laborHours, setLaborHours] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  // Load what the builder wrote into sessionStorage
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem("customInspection:sections") : null;
      const t = typeof window !== "undefined" ? sessionStorage.getItem("customInspection:title") : null;
      const includeOilRaw =
        typeof window !== "undefined" ? sessionStorage.getItem("customInspection:includeOil") : null;
      const includeOil = includeOilRaw ? JSON.parse(includeOilRaw) === true : false;

      if (t && t.trim()) setTitle(t.trim());

      if (raw) {
        const parsedUnknown = JSON.parse(raw) as unknown;
        const parsed = normalizeSections(parsedUnknown);
        const withOil = includeOil ? normalizeSections([...parsed, buildOilChangeSection()]) : parsed;

        setSections(withOil);

        // seed labor hours (editable)
        const initialHours = computeDefaultLaborHours({
          vehicleType: vehicleType ?? "truck",
          sections: withOil,
        });
        setLaborHours(initialHours);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute a suggested default if sections change drastically (do not override user edits)
  useEffect(() => {
    if (laborHours === 0 && sections.length > 0) {
      const suggested = computeDefaultLaborHours({
        vehicleType: vehicleType ?? "truck",
        sections,
      });
      setLaborHours(suggested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  /* ----------------------------- editing helpers ----------------------------- */

  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        title: "New Section",
        items: [{ item: "New Item", unit: null, status: "na" }],
      },
    ]);
  }

  function removeSection(idx: number) {
    setSections((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function updateSectionTitle(idx: number, nextTitle: string) {
    setSections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], title: nextTitle };
      return next;
    });
  }

  function addItem(secIdx: number) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      next[secIdx] = {
        ...s,
        items: [...(s.items ?? []), { item: "New Item", unit: null, status: "na" }],
      };
      return next;
    });
  }

  function removeItem(secIdx: number, itemIdx: number) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      next[secIdx] = { ...s, items: (s.items ?? []).filter((_, i) => i !== itemIdx) };
      return next;
    });
  }

  function updateItemLabel(secIdx: number, itemIdx: number, label: string) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const items = [...(s.items ?? [])];
      items[itemIdx] = { ...items[itemIdx], item: label };
      next[secIdx] = { ...s, items };
      return next;
    });
  }

  function updateItemUnit(secIdx: number, itemIdx: number, unit: string) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const items = [...(s.items ?? [])];
      items[itemIdx] = { ...items[itemIdx], unit: unit || null };
      next[secIdx] = { ...s, items };
      return next;
    });
  }

  function moveItem(secIdx: number, itemIdx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      const items = [...(s.items ?? [])];
      const j = itemIdx + dir;
      if (j < 0 || j >= items.length) return prev;
      [items[itemIdx], items[j]] = [items[j], items[itemIdx]];
      next[secIdx] = { ...s, items };
      return next;
    });
  }

  /* --------------------------------- actions --------------------------------- */

  // Save into templates table (unchanged)
  const saveTemplate = async () => {
    try {
      setSaving(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        toast.error("Please sign in.");
        return;
      }

      const cleaned = normalizeSections(sections);
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }

      const payload: InsertTemplate = {
        user_id: u.user.id,
        template_name: (title || "").trim() || "Custom Template",
        sections:
          cleaned as unknown as Database["public"]["Tables"]["inspection_templates"]["Insert"]["sections"],
        description: "Created from Custom Draft",
        vehicle_type: vehicleType || undefined,
        tags: ["custom", "draft"],
        is_public: false,
        labor_hours: Number.isFinite(laborHours) ? laborHours : null,
      };

      const { error, data } = await supabase
        .from("inspection_templates")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        // eslint-disable-next-line no-console
        console.error(error);
        toast.error("Failed to save template.");
        return;
      }

      toast.success("Template saved.");
      router.replace(`/inspections/templates`);
    } finally {
      setSaving(false);
    }
  };

  // NEW: Stage to Run/Fill
  const saveAndRun = () => {
    try {
      setRunning(true);
      const cleaned = normalizeSections(sections);
      if (cleaned.length === 0) {
        toast.error("Add at least one section with items.");
        return;
      }
      // stage canonical keys for the Run page
      sessionStorage.setItem("inspection:sections", JSON.stringify(cleaned));
      sessionStorage.setItem("inspection:title", (title || "").trim() || "Inspection");
      // go to Run
      router.push(`/inspections/run?template=${encodeURIComponent(title || "Inspection")}`);
    } finally {
      setRunning(false);
    }
  };

  /* ---------------------------------- UI ---------------------------------- */

  return (
    <div className="px-4 py-6 text-white">
      <h1 className="mb-3 text-2xl font-bold">Template Draft (Editable)</h1>

      {/* Header controls */}
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr,auto,auto] md:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Template name</span>
          <input
            className="rounded bg-neutral-800 px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Vehicle type</span>
          <div className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-200">
            {vehicleType ?? "—"}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-300">Labor hours (editable)</span>
          <input
            type="number"
            min={0}
            step={0.25}
            inputMode="decimal"
            className="w-40 rounded bg-neutral-800 px-3 py-2"
            value={Number.isFinite(laborHours) ? laborHours : 0}
            onChange={(e) => setLaborHours(Number(e.target.value))}
          />
        </label>
      </div>

      {/* Empty state */}
      {sections.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-neutral-400">
          No sections loaded. Use the button below to add a section or go back to the builder.
        </div>
      ) : null}

      {/* Sections editor */}
      <div className="space-y-4">
        {sections.map((sec, i) => (
          <div
            key={`${sec.title}-${i}`}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
          >
            {/* Section header */}
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-300">Section</span>
                <input
                  className="min-w-[220px] rounded bg-neutral-800 px-3 py-1.5 text-white"
                  value={sec.title}
                  onChange={(e) => updateSectionTitle(i, e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => moveSection(i, -1)}
                  className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50"
                  disabled={i === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveSection(i, +1)}
                  className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50"
                  disabled={i === sections.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeSection(i)}
                  className="rounded border border-red-600 px-2 py-1 text-sm text-red-300 hover:bg-red-900/40"
                  title="Remove section"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Items list */}
            <div className="space-y-2">
              {(sec.items ?? []).map((it, j) => (
                <div
                  key={`${i}-${j}-${it.item}`}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,auto,auto] sm:items-center"
                >
                  <input
                    className="rounded bg-neutral-800 px-3 py-1.5 text-sm"
                    value={it.item}
                    onChange={(e) => updateItemLabel(i, j, e.target.value)}
                    placeholder="Item label"
                  />

                  <select
                    className="rounded bg-neutral-800 px-2 py-1.5 text-sm"
                    value={it.unit ?? ""}
                    onChange={(e) => updateItemUnit(i, j, e.target.value)}
                    title="Measurement unit"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u || "blank"} value={u}>
                        {u || "— unit —"}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <button
                      onClick={() => moveItem(i, j, -1)}
                      className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
                      disabled={j === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveItem(i, j, +1)}
                      className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
                      disabled={j === (sec.items?.length ?? 0) - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                  </div>

                  <button
                    onClick={() => removeItem(i, j)}
                    className="justify-self-start rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:bg-red-900/40 sm:justify-self-end"
                    title="Remove item"
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div>
                <button
                  onClick={() => addItem(i)}
                  className="mt-2 rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600"
                >
                  + Add Item
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={addSection}
          className="rounded bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600"
        >
          + Add Section
        </button>

        <button
          onClick={saveTemplate}
          disabled={saving}
          className="rounded bg-amber-600 px-4 py-2 font-semibold text-black hover:bg-amber-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save as Template"}
        </button>

        <button
          onClick={saveAndRun}
          disabled={running}
          className="rounded bg-green-600 px-4 py-2 font-semibold text-black hover:bg-green-500 disabled:opacity-60"
          title="Stage this draft and open the Run page"
        >
          {running ? "Opening…" : "Save & Run"}
        </button>
      </div>
    </div>
  );
}