"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Search,
  Save,
} from "lucide-react";

import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";
import { masterInspectionList } from "@inspections/lib/inspection/masterInspectionList";

type SavedTemplate = {
  id: string;
  template_name: string;
  vehicle_type: string | null;
  sections: Array<{ title?: string; items?: unknown[] }>;
  created_at: string | null;
};

const MAX_TEMPLATE_ITEMS = 200;
const VEHICLE_TYPES = [
  { value: "truck", label: "Heavy truck / highway tractor / service truck" },
  { value: "trailer", label: "Trailer" },
  { value: "bus", label: "Bus / coach" },
  { value: "car", label: "Light duty / pickup / SUV" },
] as const;

function vehicleTypeLabel(value: string | null): string {
  return (
    VEHICLE_TYPES.find((option) => option.value === value)?.label ??
    value ??
    "Not specified"
  );
}

export default function FleetMaintenanceInspectionBuilder({
  fleetId,
}: {
  fleetId: string;
}) {
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [name, setName] = useState("90-Day PM Inspection");
  const [vehicleType, setVehicleType] = useState("truck");
  const [templateId, setTemplateId] = useState(() => crypto.randomUUID());
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/fleet/inspection-templates?fleetId=${encodeURIComponent(fleetId)}`,
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => ({}))) as {
      templates?: SavedTemplate[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(body.error || "Unable to load Fleet inspection templates");
    }
    setTemplates(body.templates ?? []);
  }, [fleetId]);

  useEffect(() => {
    let active = true;
    void load()
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load Fleet inspection templates",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const visibleSections = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return masterInspectionList;
    return masterInspectionList
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          [section.title, item.item, item.unit]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [query]);

  const selectedCount = useMemo(
    () =>
      Object.values(selections).reduce(
        (total, items) => total + items.length,
        0,
      ),
    [selections],
  );

  function toggleItem(sectionTitle: string, itemName: string) {
    setSelections((current) => {
      const existing = current[sectionTitle] ?? [];
      const selected = existing.includes(itemName);
      const currentCount = Object.values(current).reduce(
        (total, items) => total + items.length,
        0,
      );
      if (!selected && currentCount >= MAX_TEMPLATE_ITEMS) {
        setError(
          `Inspection templates support up to ${MAX_TEMPLATE_ITEMS} items. Remove an item before adding another.`,
        );
        return current;
      }

      const nextItems = selected
        ? existing.filter((item) => item !== itemName)
        : [...existing, itemName];

      const next = { ...current };
      if (nextItems.length) next[sectionTitle] = nextItems;
      else delete next[sectionTitle];
      return next;
    });
  }

  async function publish() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const sections = buildInspectionFromSelections({
        selections,
        extraServiceItems: [],
      });

      if (!name.trim() || !vehicleType.trim()) {
        throw new Error("Template name and vehicle type are required.");
      }
      if (!sections.length) {
        throw new Error("Select at least one item from the master inspection list.");
      }

      const response = await fetch("/api/fleet/inspection-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetId,
          templateId,
          name: name.trim(),
          vehicleType: vehicleType.trim(),
          sections,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !body.id) {
        throw new Error(
          body.error || "Unable to publish Fleet inspection template",
        );
      }

      setSuccess(
        `${name.trim()} is available for Fleet PM/service requests and will run through the Shop inspection engine after a Shop accepts the request.`,
      );
      setSelections({});
      setTemplateId(crypto.randomUUID());
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to publish Fleet inspection template",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Maintenance / PM inspection</h2>
            <p className="mt-1 max-w-3xl text-sm text-[color:var(--theme-text-secondary)]">
              Build from the same master inspection list used by ProFixIQ Shop.
              Fleet can administer and request this inspection; work-order
              creation and technician execution remain Shop-only.
            </p>
          </div>
          <button
            type="button"
            disabled={saving || selectedCount === 0}
            onClick={() => void publish()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Publishing…" : "Publish PM inspection"}
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-700 dark:text-red-200"
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            role="status"
            className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-700 dark:text-emerald-200"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Template name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Applies to
            <select
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm"
            >
              {VEHICLE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-500 dark:text-sky-300">
              Master inspection list
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              Select inspection points
            </h3>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              {selectedCount} / {MAX_TEMPLATE_ITEMS} items selected.
              These rows are stored in the canonical Shop inspection section
              format.
            </p>
          </div>
          <label className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[color:var(--theme-text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search brakes, tires, steering…"
              className="w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] py-2.5 pl-9 pr-3 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 space-y-4">
          {visibleSections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 sm:p-4"
            >
              <div className="font-semibold">{section.title}</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {section.items.map((item) => {
                  const checked = (selections[section.title] ?? []).includes(
                    item.item,
                  );
                  return (
                    <label
                      key={item.item}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && selectedCount >= MAX_TEMPLATE_ITEMS}
                        onChange={() => toggleItem(section.title, item.item)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{item.item}</span>
                        {item.unit ? (
                          <span className="ml-2 text-xs text-[color:var(--theme-text-muted)]">
                            {item.unit}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
            Fleet PM templates
          </p>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Fleet-owned definitions only. Using one creates a service request,
            not a Fleet work order.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const itemCount = (template.sections ?? []).reduce(
              (total, section) =>
                total + (Array.isArray(section.items) ? section.items.length : 0),
              0,
            );
            return (
              <article
                key={template.id}
                className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <ClipboardList className="h-4 w-4 text-sky-500" />
                  <span className="rounded-full bg-sky-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase text-sky-700 dark:text-sky-200">
                    Shop engine
                  </span>
                </div>
                <h4 className="mt-3 font-semibold">{template.template_name}</h4>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  {vehicleTypeLabel(template.vehicle_type)} · {itemCount} items
                </p>
              </article>
            );
          })}
          {!loading && templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
              No Fleet PM inspection templates yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
