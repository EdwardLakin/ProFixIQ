"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

export type FleetPmUnitOption = {
  id: string;
  fleetId: string;
  fleetName: string;
  label: string;
  description: string;
};

export type FleetPmProgramTask = {
  id?: string;
  description: string;
  jobType: string;
  laborHours: number | null;
  sectionKey: string | null;
};

export type FleetPmProgram = {
  id: string;
  fleetId: string;
  fleetName: string;
  name: string;
  cadence: string;
  intervalKm: number | null;
  intervalHours: number | null;
  intervalDays: number | null;
  notes: string | null;
  assignmentMode: "all_units" | "selected_units";
  requiresFleetApproval: boolean;
  assignedVehicleIds: string[];
  tasks: FleetPmProgramTask[];
  assignedUnits: number;
  dueUnits: number;
};

type DraftTask = FleetPmProgramTask & { key: string };

function newTask(description = ""): DraftTask {
  return {
    key:
      globalThis.crypto?.randomUUID?.() ??
      `task-${Date.now()}-${Math.random()}`,
    description,
    jobType: "maintenance",
    laborHours: null,
    sectionKey: null,
  };
}

function nullableNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function FleetPmProgramEditor({
  fleets,
  units,
  program,
  busy,
  onClose,
  onSave,
}: {
  fleets: Array<{ id: string; name: string }>;
  units: FleetPmUnitOption[];
  program: FleetPmProgram | null;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [fleetId, setFleetId] = useState(
    program?.fleetId ?? fleets[0]?.id ?? "",
  );
  const [name, setName] = useState(program?.name ?? "");
  const [cadence, setCadence] = useState(program?.cadence ?? "mileage_based");
  const [intervalKm, setIntervalKm] = useState(
    program?.intervalKm?.toString() ?? "",
  );
  const [intervalHours, setIntervalHours] = useState(
    program?.intervalHours?.toString() ?? "",
  );
  const [intervalDays, setIntervalDays] = useState(
    program?.intervalDays?.toString() ?? "",
  );
  const [assignmentMode, setAssignmentMode] = useState<
    "all_units" | "selected_units"
  >(program?.assignmentMode ?? "all_units");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState(
    () => new Set(program?.assignedVehicleIds ?? []),
  );
  const [requiresApproval, setRequiresApproval] = useState(
    program?.requiresFleetApproval ?? true,
  );
  const [notes, setNotes] = useState(program?.notes ?? "");
  const [tasks, setTasks] = useState<DraftTask[]>(() =>
    program?.tasks.length
      ? program.tasks.map((task) => ({
          ...task,
          key: task.id ?? newTask().key,
        }))
      : [newTask("Inspect and complete scheduled preventive maintenance")],
  );
  const [operationKey] = useState(() =>
    program
      ? `pm-program:update:${program.id}`
      : `pm-program:create:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
  );
  const [validation, setValidation] = useState<string | null>(null);

  const fleetUnits = useMemo(
    () => units.filter((unit) => unit.fleetId === fleetId),
    [fleetId, units],
  );

  function updateTask(key: string, changes: Partial<DraftTask>) {
    setTasks((current) =>
      current.map((task) =>
        task.key === key ? { ...task, ...changes } : task,
      ),
    );
  }

  function toggleVehicle(vehicleId: string) {
    setSelectedVehicleIds((current) => {
      const next = new Set(current);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }

  async function submit() {
    const cleanedTasks = tasks
      .map((task) => ({
        description: task.description.trim(),
        jobType: task.jobType,
        laborHours: task.laborHours,
        sectionKey: task.sectionKey,
      }))
      .filter((task) => task.description);
    if (!fleetId) return setValidation("Choose a Fleet workspace.");
    if (!name.trim()) return setValidation("Enter a PM template name.");
    if (!intervalKm.trim() && !intervalHours.trim() && !intervalDays.trim()) {
      return setValidation(
        "Enter at least one kilometre, hour, or calendar interval.",
      );
    }
    if (!cleanedTasks.length) return setValidation("Add at least one PM task.");
    if (assignmentMode === "selected_units" && selectedVehicleIds.size === 0) {
      return setValidation("Select at least one Fleet asset.");
    }

    setValidation(null);
    const saved = await onSave({
      action: "save_program",
      fleetId,
      programId: program?.id ?? null,
      name: name.trim(),
      cadence,
      intervalKm: nullableNumber(intervalKm),
      intervalHours: nullableNumber(intervalHours),
      intervalDays: nullableNumber(intervalDays),
      assignmentMode,
      vehicleIds:
        assignmentMode === "selected_units"
          ? Array.from(selectedVehicleIds)
          : [],
      tasks: cleanedTasks,
      notes: notes.trim() || null,
      requiresFleetApproval: requiresApproval,
      operationKey,
    });
    if (saved) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pm-program-editor-title"
    >
      <div className="max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sky-400/20 bg-sky-500 px-5 py-4 text-white">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
              Fleet-owned maintenance template
            </p>
            <h2
              id="pm-program-editor-title"
              className="mt-1 text-xl font-semibold"
            >
              {program ? `Edit ${program.name}` : "Create PM program"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PM program editor"
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5 text-[color:var(--theme-text-primary)]">
          {validation ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
            >
              {validation}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Fleet workspace
              <select
                value={fleetId}
                disabled={Boolean(program)}
                onChange={(event) => {
                  setFleetId(event.target.value);
                  setSelectedVehicleIds(new Set());
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
              >
                {fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {fleet.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Template name
              <input
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 120))}
                placeholder="Example: Tractor A service"
                className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
              />
            </label>
          </section>

          <section className="rounded-xl border border-[color:var(--theme-border-soft)] p-4">
            <h3 className="text-sm font-semibold">Service interval</h3>
            <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
              The first threshold reached creates one reviewable PM due event.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Primary cadence
                <select
                  value={cadence}
                  onChange={(event) => setCadence(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
                >
                  <option value="mileage_based">Kilometres</option>
                  <option value="hours_based">Engine hours</option>
                  <option value="monthly">Monthly / days</option>
                  <option value="quarterly">Quarterly / days</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Every kilometres
                <input
                  inputMode="numeric"
                  value={intervalKm}
                  onChange={(event) =>
                    setIntervalKm(event.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="20,000"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Every engine hours
                <input
                  inputMode="numeric"
                  value={intervalHours}
                  onChange={(event) =>
                    setIntervalHours(event.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="500"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Every calendar days
                <input
                  inputMode="numeric"
                  value={intervalDays}
                  onChange={(event) =>
                    setIntervalDays(event.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="90"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-[color:var(--theme-border-soft)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Template tasks</h3>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  These become structured PM request lines when maintenance is
                  due.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTasks((current) => [...current, newTask()])}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold"
              >
                <Plus className="h-4 w-4" /> Add task
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {tasks.map((task, index) => (
                <div
                  key={task.key}
                  className="grid gap-2 rounded-xl bg-[color:var(--theme-surface-subtle)] p-3 md:grid-cols-[minmax(0,1fr)_150px_120px_44px]"
                >
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Task {index + 1}
                    <input
                      value={task.description}
                      onChange={(event) =>
                        updateTask(task.key, {
                          description: event.target.value.slice(0, 500),
                        })
                      }
                      placeholder="Inspect, replace, adjust…"
                      className="mt-1 min-h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm normal-case tracking-normal"
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Work type
                    <select
                      value={task.jobType}
                      onChange={(event) =>
                        updateTask(task.key, { jobType: event.target.value })
                      }
                      className="mt-1 min-h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-2 text-xs normal-case tracking-normal"
                    >
                      <option value="maintenance">Maintenance</option>
                      <option value="inspection">Inspection</option>
                      <option value="repair">Repair</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    Est. hours
                    <input
                      inputMode="decimal"
                      value={task.laborHours ?? ""}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        updateTask(task.key, {
                          laborHours:
                            event.target.value && Number.isFinite(parsed)
                              ? Math.max(0, parsed)
                              : null,
                        });
                      }}
                      className="mt-1 min-h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-2 text-xs normal-case tracking-normal"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove task ${index + 1}`}
                    disabled={tasks.length === 1}
                    onClick={() =>
                      setTasks((current) =>
                        current.filter((item) => item.key !== task.key),
                      )
                    }
                    className="mt-4 grid h-10 w-10 place-items-center rounded-xl text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[color:var(--theme-border-soft)] p-4">
            <h3 className="text-sm font-semibold">Asset assignment</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  [
                    "all_units",
                    "All current and future Fleet assets",
                    "Best for a universal inspection or service.",
                  ],
                  [
                    "selected_units",
                    "Selected assets only",
                    "Use for tractors, trailers, buses, or a specific class.",
                  ],
                ] as const
              ).map(([value, label, description]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setAssignmentMode(value)}
                  className={`rounded-xl border p-3 text-left ${
                    assignmentMode === value
                      ? "border-sky-400/50 bg-sky-400/10"
                      : "border-[color:var(--theme-border-soft)]"
                  }`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    {description}
                  </div>
                </button>
              ))}
            </div>
            {assignmentMode === "selected_units" ? (
              <div className="mt-4 grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
                {fleetUnits.map((unit) => (
                  <label
                    key={unit.id}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.has(unit.id)}
                      onChange={() => toggleVehicle(unit.id)}
                      className="h-4 w-4 rounded border-[color:var(--theme-input-border)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {unit.label}
                      </span>
                      <span className="block truncate text-[10px] text-[color:var(--theme-text-muted)]">
                        {unit.description || unit.fleetName}
                      </span>
                    </span>
                  </label>
                ))}
                {!fleetUnits.length ? (
                  <p className="text-sm text-[color:var(--theme-text-secondary)]">
                    Enroll an asset before assigning this template.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-[1fr_260px]">
            <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Operating notes
              <textarea
                rows={3}
                value={notes}
                onChange={(event) =>
                  setNotes(event.target.value.slice(0, 2000))
                }
                placeholder="Fluids, OEM schedule, seasonal conditions, or planning notes."
                className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2 text-sm"
              />
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] p-4">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(event) => setRequiresApproval(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded"
              />
              <span>
                <span className="block text-sm font-semibold">
                  Fleet approval required
                </span>
                <span className="mt-1 block text-xs text-[color:var(--theme-text-muted)]">
                  Keep estimate decisions with the Fleet before Shop work
                  begins.
                </span>
              </span>
            </label>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--theme-border-soft)] pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="min-h-11 rounded-xl bg-sky-400 px-5 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {busy
                ? "Saving PM program…"
                : program
                  ? "Save PM program"
                  : "Create PM program"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
