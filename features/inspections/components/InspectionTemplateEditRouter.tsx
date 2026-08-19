"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import CustomDraftPage from "@/features/inspections/app/inspection/custom-draft/page";
import {
  getInspectionBuilderNavigation,
  type InspectionBuilderSurface,
} from "@/features/inspections/lib/inspectionBuilderNavigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type ImportedFieldType = "check" | "defect" | "measurement";
type ImportedItem = {
  item: string;
  unit: string | null;
  fieldType: ImportedFieldType;
};
type ImportedSection = { title: string; items: ImportedItem[] };

type TemplateRow = {
  template_name: string | null;
  sections: unknown;
  vehicle_type: string | null;
  labor_hours: number | null;
  tags: string[] | null;
};

const FIELD_TYPES = new Set<ImportedFieldType>([
  "check",
  "defect",
  "measurement",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedSections(value: unknown): ImportedSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((rawSection) => {
      if (!isRecord(rawSection)) return null;
      const title = String(rawSection.title ?? "").trim();
      if (!title || !Array.isArray(rawSection.items)) return null;
      const items = rawSection.items
        .map((rawItem) => {
          if (!isRecord(rawItem)) return null;
          const item = String(rawItem.item ?? rawItem.name ?? "").trim();
          if (!item) return null;
          const unit =
            typeof rawItem.unit === "string" && rawItem.unit.trim()
              ? rawItem.unit.trim()
              : null;
          const rawFieldType = String(rawItem.fieldType ?? "")
            .trim()
            .toLowerCase();
          // Imported templates created before this repair can have their
          // fieldType stripped by the old generic editor. The durable
          // customer-form tag still routes them here; keep every row visible
          // and give it a safe editable fallback rather than deleting it.
          const fieldType = FIELD_TYPES.has(rawFieldType as ImportedFieldType)
            ? (rawFieldType as ImportedFieldType)
            : unit
              ? "measurement"
              : "check";
          return { item, unit, fieldType } satisfies ImportedItem;
        })
        .filter((item): item is ImportedItem => item !== null);
      return items.length ? ({ title, items } satisfies ImportedSection) : null;
    })
    .filter((section): section is ImportedSection => section !== null);
}

function ImportedFleetTemplateEditor({
  templateId,
  initial,
  surface,
}: {
  templateId: string;
  initial: TemplateRow;
  surface: InspectionBuilderSurface;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const navigation = getInspectionBuilderNavigation(surface);
  const [title, setTitle] = useState(
    initial.template_name ?? "Imported fleet form",
  );
  const [vehicleType, setVehicleType] = useState(initial.vehicle_type ?? "");
  const [laborHours, setLaborHours] = useState(
    typeof initial.labor_hours === "number" ? String(initial.labor_hours) : "",
  );
  const [sections, setSections] = useState<ImportedSection[]>(() =>
    normalizedSections(initial.sections),
  );
  const [saving, setSaving] = useState(false);

  const updateSection = (
    sectionIndex: number,
    updater: (section: ImportedSection) => ImportedSection,
  ) => {
    setSections((current) =>
      current.map((section, index) =>
        index === sectionIndex ? updater(section) : section,
      ),
    );
  };

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<ImportedItem>,
  ) => {
    updateSection(sectionIndex, (section) => ({
      ...section,
      items: section.items.map((item, index) =>
        index === itemIndex ? { ...item, ...patch } : item,
      ),
    }));
  };

  const save = async () => {
    const cleaned = sections
      .map((section) => ({
        title: section.title.trim(),
        items: section.items
          .map((item) => ({
            item: item.item.trim(),
            unit: item.unit?.trim() || null,
            fieldType: item.fieldType,
          }))
          .filter((item) => item.item.length > 0),
      }))
      .filter((section) => section.title && section.items.length > 0);
    if (!title.trim() || !cleaned.length) {
      toast.error(
        "A template name and at least one inspection row are required.",
      );
      return;
    }

    const parsedLabor = laborHours.trim() ? Number(laborHours) : null;
    if (
      parsedLabor != null &&
      (!Number.isFinite(parsedLabor) || parsedLabor < 0)
    ) {
      toast.error("Labor hours must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      if (navigation.surface === "field") {
        const response = await fetch(
          "/api/mobile/service/inspection-templates",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateId,
              templateName: title.trim(),
              sections: cleaned,
              vehicleType: vehicleType.trim() || null,
              laborHours: parsedLabor,
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(body?.error || "Unable to save imported template.");
        }
      } else {
        const { error } = await supabase
          .from("inspection_templates")
          .update({
            template_name: title.trim(),
            sections: cleaned,
            vehicle_type: vehicleType.trim() || null,
            labor_hours: parsedLabor,
          } as never)
          .eq("id", templateId);
        if (error) throw error;
      }
      toast.success("Imported fleet template saved.");
      setSections(cleaned);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save imported template.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] p-5 shadow-[var(--theme-shadow-medium)]">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">
          Fleet Form Import
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              Edit imported inspection template
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
              Imported row types are preserved here so defect classifications
              and measurements keep the source form&apos;s meaning.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(navigation.templatesHref)}
            className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
          >
            Back to templates
          </button>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 sm:grid-cols-3">
        <label className="text-xs text-[color:var(--theme-text-secondary)] sm:col-span-3">
          Template name
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-xs text-[color:var(--theme-text-secondary)] sm:col-span-2">
          Vehicle type
          <input
            value={vehicleType}
            onChange={(event) => setVehicleType(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="text-xs text-[color:var(--theme-text-secondary)]">
          Labor hours
          <input
            type="number"
            min="0"
            step="0.01"
            value={laborHours}
            onChange={(event) => setLaborHours(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm"
          />
        </label>
      </section>

      <div className="space-y-4">
        {sections.map((section, sectionIndex) => (
          <section
            key={sectionIndex}
            className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4"
          >
            <div className="flex gap-2">
              <input
                value={section.title}
                onChange={(event) =>
                  updateSection(sectionIndex, (current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="min-w-0 flex-1 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 font-semibold"
              />
              <button
                type="button"
                disabled={sections.length === 1}
                onClick={() =>
                  setSections((current) =>
                    current.filter((_, index) => index !== sectionIndex),
                  )
                }
                className="rounded-xl px-3 text-xs text-red-400 disabled:opacity-30"
              >
                Remove
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {section.items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className="grid gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 sm:grid-cols-[minmax(0,1fr)_130px_100px_auto]"
                >
                  <input
                    value={item.item}
                    onChange={(event) =>
                      updateItem(sectionIndex, itemIndex, {
                        item: event.target.value,
                      })
                    }
                    aria-label="Inspection item"
                    className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-sm"
                  />
                  <select
                    value={item.fieldType}
                    onChange={(event) =>
                      updateItem(sectionIndex, itemIndex, {
                        fieldType: event.target.value as ImportedFieldType,
                      })
                    }
                    aria-label="Imported row type"
                    className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs"
                  >
                    <option value="check">Check</option>
                    <option value="defect">Defect</option>
                    <option value="measurement">Measurement</option>
                  </select>
                  <input
                    value={item.unit ?? ""}
                    disabled={item.fieldType !== "measurement"}
                    onChange={(event) =>
                      updateItem(sectionIndex, itemIndex, {
                        unit: event.target.value || null,
                      })
                    }
                    aria-label="Measurement unit"
                    placeholder="Unit"
                    className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs disabled:opacity-45"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateSection(sectionIndex, (current) => ({
                        ...current,
                        items: current.items.filter(
                          (_, index) => index !== itemIndex,
                        ),
                      }))
                    }
                    className="rounded-lg px-2 text-xs text-red-400"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                updateSection(sectionIndex, (current) => ({
                  ...current,
                  items: [
                    ...current.items,
                    {
                      item: "New inspection item",
                      unit: null,
                      fieldType: "check",
                    },
                  ],
                }))
              }
              className="mt-3 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
            >
              + Add item
            </button>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            setSections((current) => [
              ...current,
              {
                title: "New section",
                items: [
                  {
                    item: "New inspection item",
                    unit: null,
                    fieldType: "check",
                  },
                ],
              },
            ])
          }
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold"
        >
          + Add section
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </main>
  );
}

export default function InspectionTemplateEditRouter({
  surface = "shop",
}: {
  surface?: InspectionBuilderSurface;
}) {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId");
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [checking, setChecking] = useState(Boolean(templateId));
  const [importedTemplate, setImportedTemplate] = useState<TemplateRow | null>(
    null,
  );
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) {
      setChecking(false);
      setImportedTemplate(null);
      setCheckError(null);
      return;
    }

    let active = true;
    setChecking(true);
    setCheckError(null);
    void supabase
      .from("inspection_templates")
      .select("template_name, sections, vehicle_type, labor_hours, tags")
      .eq("id", templateId)
      .maybeSingle<TemplateRow>()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setImportedTemplate(null);
          setCheckError(error?.message || "Template not found.");
          setChecking(false);
          return;
        }
        const taggedImported =
          Array.isArray(data.tags) && data.tags.includes("customer-form");
        setImportedTemplate(taggedImported ? data : null);
        setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [supabase, templateId]);

  if (checking) {
    return (
      <div className="p-6 text-sm text-[color:var(--theme-text-secondary)]">
        Loading template editor…
      </div>
    );
  }

  if (checkError) {
    return (
      <div className="m-6 rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-300">
        Unable to load this template safely: {checkError}
      </div>
    );
  }

  if (templateId && importedTemplate) {
    return (
      <ImportedFleetTemplateEditor
        templateId={templateId}
        initial={importedTemplate}
        surface={surface}
      />
    );
  }

  return <CustomDraftPage surface={surface} />;
}
