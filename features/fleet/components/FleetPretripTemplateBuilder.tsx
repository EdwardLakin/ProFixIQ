"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  GripVertical,
  Mic,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import type {
  FleetPretripFieldType,
  FleetPretripTemplateItem,
  FleetPretripTemplateSection,
} from "@/features/fleet/types/driverPortal";

type TemplateHistoryRow = {
  id: string;
  vehicle_type: string;
  version: number;
  active: boolean;
  created_at: string;
  inspection_templates:
    | { template_name: string; sections: FleetPretripTemplateSection[] }
    | Array<{ template_name: string; sections: FleetPretripTemplateSection[] }>;
};

function key(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function failureActions(): FleetPretripTemplateItem["failureActions"] {
  return {
    notifyDispatcher: true,
    flagForReview: true,
    requirePhoto: false,
    markVehicleAttention: false,
  };
}

function starterSections(): FleetPretripTemplateSection[] {
  return [
    {
      id: "walkaround",
      title: "Walk-around",
      items: [
        {
          id: "brakes",
          item: "Brakes / air system",
          label: "Brakes / air system",
          type: "pass_fail",
          required: true,
          unit: null,
          severity: "safety",
          failureActions: {
            ...failureActions(),
            requirePhoto: true,
            markVehicleAttention: true,
          },
        },
        {
          id: "tire_pressure",
          item: "Steer tire pressure",
          label: "Steer tire pressure",
          type: "number",
          required: false,
          unit: "psi",
          severity: "compliance",
          failureActions: failureActions(),
        },
      ],
    },
  ];
}

function templateRow(value: TemplateHistoryRow["inspection_templates"]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function FleetPretripTemplateBuilder({
  fleetId,
}: {
  fleetId: string;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateHistoryRow[]>([]);
  const [name, setName] = useState("Daily pre-trip");
  const [vehicleType, setVehicleType] = useState("Highway tractor");
  const [sections, setSections] =
    useState<FleetPretripTemplateSection[]>(starterSections);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/fleet/pretrip/templates?fleetId=${encodeURIComponent(fleetId)}`,
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => ({}))) as {
      templates?: TemplateHistoryRow[];
      error?: string;
    };
    if (!response.ok) throw new Error(body.error || "Unable to load templates");
    setTemplates(body.templates ?? []);
  }, [fleetId]);

  useEffect(() => {
    let active = true;
    void load()
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Unable to load templates",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  function updateSection(
    sectionId: string,
    updater: (
      section: FleetPretripTemplateSection,
    ) => FleetPretripTemplateSection,
  ) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? updater(section) : section,
      ),
    );
  }

  function updateItem(
    sectionId: string,
    itemId: string,
    patch: Partial<FleetPretripTemplateItem>,
  ) {
    updateSection(sectionId, (section) => ({
      ...section,
      items: section.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addSection() {
    setSections((current) => [
      ...current,
      { id: key("section"), title: "New section", items: [] },
    ]);
  }

  function addItem(
    sectionId: string,
    type: FleetPretripFieldType = "pass_fail",
  ) {
    const id = key("item");
    updateSection(sectionId, (section) => ({
      ...section,
      items: [
        ...section.items,
        {
          id,
          item: "New inspection item",
          label: "New inspection item",
          type,
          required: false,
          unit: type === "number" ? "psi" : null,
          severity: "recommend",
          failureActions: failureActions(),
        },
      ],
    }));
  }

  async function publish() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!name.trim() || !vehicleType.trim()) {
        throw new Error("Template name and vehicle type are required.");
      }
      if (
        !sections.length ||
        sections.some((section) => !section.items.length)
      ) {
        throw new Error("Every section needs at least one inspection item.");
      }

      const response = await fetch("/api/fleet/pretrip/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetId,
          name,
          vehicleType,
          sections,
          operationKey: crypto.randomUUID(),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        version?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Unable to publish template");

      setSuccess(
        `${name.trim()} version ${body.version ?? "new"} is now active for ${vehicleType.trim()}.`,
      );
      await load();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to publish template",
      );
    } finally {
      setSaving(false);
    }
  }

  const activeTemplates = templates.filter((template) => template.active);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
            Fleet configuration
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Pre-trip Template Builder
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            Build the questions drivers see by asset type. Publishing creates a
            new version, so completed inspections keep the exact form used that
            day.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void publish()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />{" "}
          {saving ? "Publishing…" : "Publish template"}
        </button>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-700 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-700 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4" /> {success}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {activeTemplates.map((template) => {
          const canonical = templateRow(template.inspection_templates);
          const itemCount = (canonical?.sections ?? []).reduce(
            (total, section) => total + section.items.length,
            0,
          );
          return (
            <div
              key={template.id}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <ClipboardList className="h-4 w-4 text-sky-500" />
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase text-emerald-700 dark:text-emerald-200">
                  Active · v{template.version}
                </span>
              </div>
              <h2 className="mt-3 font-semibold">
                {canonical?.template_name ?? "Pre-trip"}
              </h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                {template.vehicle_type} · {itemCount} items
              </p>
            </div>
          );
        })}
        {!loading && !activeTemplates.length ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
            No custom template yet. Drivers use the safe standard pre-trip until
            you publish one.
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
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
            Vehicle type
            <input
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value)}
              list="fleet-vehicle-types"
              maxLength={80}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm"
            />
            <datalist id="fleet-vehicle-types">
              {[
                "All fleet assets",
                "Highway tractor",
                "Dump truck",
                "Service truck",
                "Trailer",
                "Bus",
                "Pickup",
              ].map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="mt-5 space-y-4">
          {sections.map((section, sectionIndex) => (
            <div
              key={section.id}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 sm:p-4"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-[color:var(--theme-text-muted)]" />
                <input
                  value={section.title}
                  onChange={(event) =>
                    updateSection(section.id, (current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  aria-label={`Section ${sectionIndex + 1} title`}
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                />
                <button
                  type="button"
                  aria-label={`Remove ${section.title}`}
                  disabled={sections.length === 1}
                  onClick={() =>
                    setSections((current) =>
                      current.filter(
                        (candidate) => candidate.id !== section.id,
                      ),
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-red-500 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                  >
                    <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_90px_42px]">
                      <input
                        value={item.label}
                        onChange={(event) =>
                          updateItem(section.id, item.id, {
                            label: event.target.value,
                            item: event.target.value,
                          })
                        }
                        aria-label="Inspection item label"
                        className="rounded-lg border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2 text-sm"
                      />
                      <select
                        value={item.type}
                        onChange={(event) =>
                          updateItem(section.id, item.id, {
                            type: event.target.value as FleetPretripFieldType,
                            unit:
                              event.target.value === "number"
                                ? item.unit || "psi"
                                : null,
                          })
                        }
                        aria-label="Field type"
                        className="rounded-lg border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-2 py-2 text-xs"
                      >
                        <option value="pass_fail">Pass / fail</option>
                        <option value="number">Measurement</option>
                        <option value="photo">Photo</option>
                        <option value="voice">Voice note</option>
                      </select>
                      {item.type === "number" ? (
                        <input
                          value={item.unit ?? ""}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              unit: event.target.value,
                            })
                          }
                          aria-label="Measurement unit"
                          placeholder="Unit"
                          className="rounded-lg border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-2 py-2 text-xs"
                        />
                      ) : (
                        <label className="flex items-center justify-center gap-1 text-[10px] font-semibold">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                required: event.target.checked,
                              })
                            }
                          />
                          Required
                        </label>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${item.label}`}
                        onClick={() =>
                          updateSection(section.id, (current) => ({
                            ...current,
                            items: current.items.filter(
                              (candidate) => candidate.id !== item.id,
                            ),
                          }))
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {item.type === "pass_fail" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[color:var(--theme-text-secondary)]">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                required: event.target.checked,
                              })
                            }
                          />{" "}
                          Required
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={item.failureActions.notifyDispatcher}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                failureActions: {
                                  ...item.failureActions,
                                  notifyDispatcher: event.target.checked,
                                },
                              })
                            }
                          />{" "}
                          Notify dispatch
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={item.failureActions.requirePhoto}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                failureActions: {
                                  ...item.failureActions,
                                  requirePhoto: event.target.checked,
                                },
                              })
                            }
                          />{" "}
                          Require photo on fail
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={item.failureActions.markVehicleAttention}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                failureActions: {
                                  ...item.failureActions,
                                  markVehicleAttention: event.target.checked,
                                },
                              })
                            }
                          />{" "}
                          Mark asset attention
                        </label>
                        <select
                          value={item.severity}
                          onChange={(event) =>
                            updateItem(section.id, item.id, {
                              severity: event.target
                                .value as FleetPretripTemplateItem["severity"],
                            })
                          }
                          aria-label="Failure severity"
                          className="rounded-lg border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-2 py-1"
                        >
                          <option value="safety">Safety</option>
                          <option value="compliance">Compliance</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="recommend">Attention</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => addItem(section.id, "pass_fail")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 text-[10px] font-semibold"
                >
                  <Plus className="h-3 w-3" /> Pass/fail
                </button>
                <button
                  type="button"
                  onClick={() => addItem(section.id, "number")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 text-[10px] font-semibold"
                >
                  <Plus className="h-3 w-3" /> Measurement
                </button>
                <button
                  type="button"
                  onClick={() => addItem(section.id, "photo")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 text-[10px] font-semibold"
                >
                  <Camera className="h-3 w-3" /> Photo
                </button>
                <button
                  type="button"
                  onClick={() => addItem(section.id, "voice")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 text-[10px] font-semibold"
                >
                  <Mic className="h-3 w-3" /> Voice
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSection}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-sky-400/35 px-3 text-xs font-semibold text-sky-600 dark:text-sky-200"
        >
          <Plus className="h-4 w-4" /> Add section
        </button>
      </section>

      {templates.some((template) => !template.active) ? (
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] p-4">
          <h2 className="text-sm font-semibold">Version history</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {templates
              .filter((template) => !template.active)
              .map((template) => (
                <span
                  key={template.id}
                  className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-[10px] text-[color:var(--theme-text-muted)]"
                >
                  {template.vehicle_type} · v{template.version}
                </span>
              ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
