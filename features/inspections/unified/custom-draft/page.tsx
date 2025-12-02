"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type {
  InspectionSection,
  InspectionItem,
} from "@inspections/lib/inspection/types";
import { computeDefaultLaborHours } from "@inspections/lib/inspection/computeLabor";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";
import toast from "react-hot-toast";

const UNIT_OPTIONS = ["", "mm", "psi", "kPa", "in", "ft·lb"] as const;

type VehicleType = "car" | "truck" | "bus" | "trailer";
type DutyClass = "light" | "medium" | "heavy";

/** Narrow types to include labor_hours until generated types include it */
type InsertTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Insert"] & {
    labor_hours?: number | null;
  };

type UpdateTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Update"] & {
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
  const label = asString(i.item ?? i.name).trim();
  const unit = (isRecord(i) ? (i.unit as InspectionItem["unit"]) : null) ?? null;

  const rawStatus = isRecord(i) ? i.status : undefined;
  const status: InspectionItem["status"] | undefined =
    rawStatus === "ok" ||
    rawStatus === "fail" ||
    rawStatus === "na" ||
    rawStatus === "recommend"
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
    const seen = new Set(
      (bucket.items ?? []).map((x) => (x.item ?? "").toLowerCase()),
    );

    for (const it of items) {
      const key = (it.item ?? "").toLowerCase();
      if (!seen.has(key)) {
        bucket.items = [...(bucket.items ?? []), it];
        seen.add(key);
      }
    }
  }

  return Array.from(byTitle.values()).filter(
    (s) => (s.items?.length ?? 0) > 0,
  );
}

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

export default function UnifiedCustomDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  // if the user clicked "Edit" from the template list we expect ?templateId=...
  const templateId = sp.get("templateId");

  const [title, setTitle] = useState(sp.get("template") || "Custom Inspection");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(
    (sp.get("vehicleType") as VehicleType | null) || null,
  );
  // keep both value and setter to satisfy TS AND to react to session/template loads
  const [dutyClass, setDutyClass] = useState<DutyClass | null>(
    (sp.get("dutyClass") as DutyClass | null) || null,
  );

  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [laborHours, setLaborHours] = useState<number>(0);
  const [, setUserEditedLabor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  // build a quick lookup: normalized title -> master items (used for the add-item dropdown)
  const masterByTitle = useMemo(() => {
    const out = new Map<string, { item: string; unit?: string | null }[]>();
    for (const sec of masterInspectionList) {
      out.set(sec.title.trim().toLowerCase(), sec.items);
    }
    return out;
  }, []);

  function getMasterItemsForSection(title: string) {
    const key = (title || "").trim().toLowerCase();
    return masterByTitle.get(key) ?? [];
  }

  // 1) try to load from sessionStorage (what custom builder wrote)
  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:sections")
          : null;
      const t =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:title")
          : null;
      const includeOilRaw =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:includeOil")
          : null;
      const storedDuty =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:dutyClass")
          : null;

      const includeOil = includeOilRaw
        ? JSON.parse(includeOilRaw) === true
        : false;

      if (t && t.trim()) setTitle(t.trim());
      if (storedDuty) {
        // ✅ use the setter so TS sees it being used
        setDutyClass(storedDuty as DutyClass);
      }

      if (raw) {
        const parsedUnknown = JSON.parse(raw) as unknown;
        const parsed = normalizeSections(parsedUnknown);
        const withOil = includeOil
          ? normalizeSections([...parsed, buildOilChangeSection()])
          : parsed;

        setSections(withOil);

        const initialHours = computeDefaultLaborHours({
          vehicleType: vehicleType ?? "truck",
          sections: withOil,
        });
        setLaborHours(initialHours);
      }
    } catch {
      /* ignore bad session data */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) if we came from "Edit template", pull it from Supabase and override
  useEffect(() => {
    if (!templateId) return;

    (async () => {
      const { data, error } = await supabase
        .from("inspection_templates")
        .select("template_name, sections, vehicle_type, labor_hours")
        .eq("id", templateId)
        .maybeSingle();

      if (error || !data) {
        console.error(error);
        toast.error("Could not load template.");
        return;
      }

      const normalized = normalizeSections(data.sections as unknown);
      setSections(normalized);
      setTitle(data.template_name || "Custom Inspection");

      // update vehicle/duty from template if present
      if (data.vehicle_type) {
        setVehicleType(data.vehicle_type as VehicleType);
      }
      // if you add a duty_class column later, set it here
      // setDutyClass(data.duty_class as DutyClass | null ?? null);

      if (typeof data.labor_hours === "number") {
        setLaborHours(data.labor_hours);
      } else {
        // recompute if not in DB
        const hours = computeDefaultLaborHours({
          vehicleType: (data.vehicle_type as VehicleType) ?? "truck",
          sections: normalized,
        });
        setLaborHours(hours);
      }
    })();
  }, [templateId, supabase]);

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
        items: [
          ...(s.items ?? []),
          { item: "New Item", unit: null, status: "na" },
        ],
      };
      return next;
    });
  }

  function removeItem(secIdx: number, itemIdx: number) {
    setSections((prev) => {
      const next = [...prev];
      const s = next[secIdx];
      next[secIdx] = {
        ...s,
        items: (s.items ?? []).filter((_, i) => i !== itemIdx),
      };
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

  /* -------------------------- shared payload builder -------------------------- */

  const buildTemplatePayload = (
    userId: string,
  ): { cleaned: InspectionSection[]; payload: InsertTemplate } | null => {
    const cleaned = normalizeSections(sections);
    if (cleaned.length === 0) {
      toast.error("Add at least one section with items.");
      return null;
    }

    const payload: InsertTemplate = {
      user_id: userId,
      template_name: (title || "").trim() || "Custom Template",
      sections:
        (cleaned as unknown) as Database["public"]["Tables"]["inspection_templates"]["Insert"]["sections"],
      description: "Created from Custom Draft",
      vehicle_type: vehicleType || undefined,
      tags: ["custom", "draft"],
      is_public: false,
      labor_hours: Number.isFinite(laborHours) ? laborHours : null,
    };

    return { cleaned, payload };
  };

  /* --------------------------------- actions --------------------------------- */

  const saveTemplate = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        toast.error("Please sign in.");
        return;
      }

      const built = buildTemplatePayload(u.user.id);
      if (!built) return;
      const { payload } = built;

      // If editing an existing template, update instead of inserting a new one
      if (templateId) {
        const updatePayload: UpdateTemplate = { ...payload };
        const { error } = await supabase
          .from("inspection_templates")
          .update(updatePayload)
          .eq("id", templateId);

        if (error) {
          console.error(error);
          toast.error("Failed to update template.");
          return;
        }

        toast.success("Template updated.");
      } else {
        const { error, data } = await supabase
          .from("inspection_templates")
          .insert(payload)
          .select("id")
          .maybeSingle();

        if (error || !data?.id) {
          console.error(error);
          toast.error("Failed to save template.");
          return;
        }

        toast.success("Template saved.");
      }

      router.replace(`/inspections/templates`);
    } finally {
      setSaving(false);
    }
  };

  const saveAndRun = async () => {
    setRunning(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) {
        toast.error("Please sign in.");
        return;
      }

      const built = buildTemplatePayload(u.user.id);
      if (!built) return;
      const { cleaned, payload } = built;

      // keep staging for now (not strictly required)
      if (typeof window !== "undefined") {
        sessionStorage.setItem("inspection:sections", JSON.stringify(cleaned));
        sessionStorage.setItem(
          "inspection:title",
          (title || "").trim() || "Inspection",
        );
      }

      // Always create a fresh template row for "Save & Run"
      const { error, data } = await supabase
        .from("inspection_templates")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        console.error(error);
        toast.error("Failed to save template.");
        return;
      }

      const qs = new URLSearchParams();
      qs.set("templateId", data.id);
      if (vehicleType) qs.set("vehicleType", vehicleType);
      if (dutyClass) qs.set("dutyClass", dutyClass);

      // unified runner now expects templateId in the query
      router.push(`/inspections/run?${qs.toString()}`);
    } finally {
      setRunning(false);
    }
  };

  /* ---------------------------------- UI ---------------------------------- */

  return (
    <div className="min-h-[60vh] bg-gradient-to-b from-black via-slate-950 to-black px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-br from-black/80 via-slate-950/95 to-black/98 p-5 shadow-[0_26px_70px_rgba(0,0,0,0.98)] backdrop-blur-xl">
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
              Custom Inspection · Builder
            </div>
            <h1 className="text-xl font-blackops tracking-[0.18em] text-[color:var(--accent-copper-light,#fed7aa)]">
              Template Draft (Editable)
            </h1>
            <p className="text-xs text-neutral-500">
              Tweak sections & items, set labor hours and units, then save as a
              reusable template.
            </p>
          </div>
        </header>

        {/* Header controls */}
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr,auto,auto,auto] md:items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
              Template name
            </span>
            <input
              className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm outline-none focus:border-[color:var(--accent-copper,#ea580c)] focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
              Vehicle type
            </span>
            <div className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-200">
              {vehicleType ?? "—"}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
              Duty class
            </span>
            <div className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-200">
              {dutyClass ?? "—"}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
              Labor hours (editable)
            </span>
            <input
              type="number"
              min={0}
              step={0.25}
              inputMode="decimal"
              className="w-40 rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm outline-none focus:border-[color:var(--accent-copper,#ea580c)] focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
              value={Number.isFinite(laborHours) ? laborHours : 0}
              onChange={(e) => {
                setLaborHours(Number(e.target.value));
                setUserEditedLabor(true);
              }}
            />
          </label>
        </div>

        {/* Sections editor */}
        <div className="space-y-4">
          {sections.map((sec, i) => {
            const masterItemsForThisSection = getMasterItemsForSection(
              sec.title,
            );
            return (
              <div
                key={`${sec.title}-${i}`}
                className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-3"
              >
                {/* Section header */}
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      Section
                    </span>
                    <input
                      className="min-w-[220px] rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 text-sm text-white outline-none focus:border-[color:var(--accent-copper,#ea580c)] focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
                      value={sec.title}
                      onChange={(e) => updateSectionTitle(i, e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => moveSection(i, -1)}
                      className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
                      disabled={i === 0}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveSection(i, +1)}
                      className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
                      disabled={i === sections.length - 1}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeSection(i)}
                      className="rounded border border-red-600/70 bg-red-900/30 px-2 py-1 text-xs text-red-200 hover:bg-red-900/60"
                      title="Remove section"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Items list */}
                <div className="space-y-2">
                  {(sec.items ?? []).map((it, j) => {
                    const isPlaceholder = it.item === "New Item";
                    const hasMaster = masterItemsForThisSection.length > 0;
                    return (
                      <div
                        key={`${i}-${j}-${it.item}-${j}`}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,auto,auto] sm:items-center"
                      >
                        {/* label or dropdown */}
                        {isPlaceholder && hasMaster ? (
                          <select
                            className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 text-sm"
                            value=""
                            onChange={(e) =>
                              updateItemLabel(
                                i,
                                j,
                                e.target.value || "New Item",
                              )
                            }
                          >
                            <option value="">— pick an item —</option>
                            {masterItemsForThisSection.map((mi) => (
                              <option key={mi.item} value={mi.item}>
                                {mi.item}
                              </option>
                            ))}
                            <option value="Custom item…">Custom item…</option>
                          </select>
                        ) : (
                          <input
                            className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 text-sm"
                            value={it.item}
                            onChange={(e) =>
                              updateItemLabel(i, j, e.target.value)
                            }
                            placeholder="Item label"
                          />
                        )}

                        {/* unit */}
                        <select
                          className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-2 py-1.5 text-sm"
                          value={it.unit ?? ""}
                          onChange={(e) =>
                            updateItemUnit(i, j, e.target.value)
                          }
                          title="Measurement unit"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u || "blank"} value={u}>
                              {u || "— unit —"}
                            </option>
                          ))}
                        </select>

                        {/* reorder */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => moveItem(i, j, -1)}
                            className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-2 py-1 text-[11px] hover:bg-white/5 disabled:opacity-50"
                            disabled={j === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveItem(i, j, +1)}
                            className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-2 py-1 text-[11px] hover:bg-white/5 disabled:opacity-50"
                            disabled={j === (sec.items?.length ?? 0) - 1}
                            title="Move down"
                          >
                            ↓
                          </button>
                        </div>

                        {/* remove */}
                        <button
                          onClick={() => removeItem(i, j)}
                          className="justify-self-start rounded border border-red-600/70 bg-red-900/30 px-2 py-1 text-[11px] text-red-200 hover:bg-red-900/60 sm:justify-self-end"
                          title="Remove item"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}

                  <div>
                    <button
                      onClick={() => addItem(i)}
                      className="mt-2 rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 text-sm hover:bg-white/5"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={addSection}
            className="rounded border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-4 py-2 text-sm hover:bg-white/5"
          >
            + Add Section
          </button>

          <button
            onClick={saveTemplate}
            disabled={saving}
            className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#fdba74),var(--accent-copper,#ea580c))] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_26px_rgba(234,88,12,0.85)] hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save as Template"}
          </button>

          <button
            onClick={saveAndRun}
            disabled={running}
            className="rounded-full border border-emerald-500/70 bg-emerald-500/15 px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
            title="Save this draft as a template and open the Run page"
          >
            {running ? "Opening…" : "Save & Run"}
          </button>
        </div>
      </div>
    </div>
  );
}