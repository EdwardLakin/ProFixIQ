"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import FleetPmProgramEditor, {
  type FleetPmProgram,
  type FleetPmUnitOption,
} from "@/features/fleet/components/FleetPmProgramEditor";

type RoutePrefix = "/fleet" | "/portal/fleet";
type Filter = "action" | "overdue" | "due" | "deferred" | "converted" | "all";

type PmItem = {
  id: string;
  fleetId: string;
  fleetName: string;
  vehicleId: string;
  unitLabel: string;
  vehicleDescription: string;
  policyId: string;
  programId: string;
  name: string;
  status: string;
  urgency: "overdue" | "due" | "deferred" | "converted";
  ageDays: number;
  dueReasons: string[];
  firstDueAt: string;
  deferredUntil: string | null;
  serviceRequestId: string | null;
  currentOdometerKm: number | null;
  currentEngineHours: number | null;
  intervalKm: number | null;
  intervalHours: number | null;
  intervalDays: number | null;
  lastCompletedAt: string | null;
  requiresApproval: boolean;
};

type Payload = {
  canManage: boolean;
  canManagePrograms: boolean;
  fleets: Array<{ id: string; name: string }>;
  summary: {
    overdue: number;
    due: number;
    deferred: number;
    converted: number;
    clearUnits: number;
  };
  units: FleetPmUnitOption[];
  items: PmItem[];
  programs: FleetPmProgram[];
};

const card =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card";

function intervalLabel(
  item: Pick<
    PmItem | FleetPmProgram,
    "intervalKm" | "intervalHours" | "intervalDays"
  >,
) {
  return (
    [
      item.intervalKm ? `${item.intervalKm.toLocaleString()} km` : null,
      item.intervalHours
        ? `${item.intervalHours.toLocaleString()} hours`
        : null,
      item.intervalDays ? `${item.intervalDays} days` : null,
    ]
      .filter(Boolean)
      .join(" / ") || "Custom interval"
  );
}

function dateInputDefault() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return localDateInput(date);
}

function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function FleetMaintenanceWorkspace({
  uiContext,
  routePrefix,
}: {
  uiContext: FleetUiContext;
  routePrefix: RoutePrefix;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<Filter>("action");
  const [fleetId, setFleetId] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [deferItem, setDeferItem] = useState<PmItem | null>(null);
  const [requestItem, setRequestItem] = useState<PmItem | null>(null);
  const [requestedForDate, setRequestedForDate] = useState(dateInputDefault);
  const [programEditor, setProgramEditor] = useState<
    FleetPmProgram | null | undefined
  >(undefined);
  const [deferUntil, setDeferUntil] = useState(dateInputDefault);
  const [deferReason, setDeferReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "list",
          fleetId: fleetId === "all" ? null : fleetId,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as
        | Payload
        | { error?: string };
      if (!response.ok || !("items" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Unable to load maintenance",
        );
      }
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load maintenance",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // load is intentionally triggered by the selected fleet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetId]);

  async function mutate(body: Record<string, unknown>, itemId?: string) {
    setWorkingId(itemId ?? "workspace");
    setError(null);
    try {
      const response = await fetch("/api/fleet/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "PM action failed");
      await load();
      return true;
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "PM action failed",
      );
      return false;
    } finally {
      setWorkingId(null);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      if (
        filter === "action" &&
        !["overdue", "due", "deferred"].includes(item.urgency)
      ) {
        return false;
      }
      if (filter !== "action" && filter !== "all" && item.urgency !== filter) {
        return false;
      }
      if (!query) return true;
      return [
        item.unitLabel,
        item.vehicleDescription,
        item.name,
        item.fleetName,
        ...item.dueReasons,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [data?.items, filter, search]);

  const headline =
    (data?.summary.overdue ?? 0) > 0
      ? `${data?.summary.overdue} overdue PM item${data?.summary.overdue === 1 ? "" : "s"} should be scheduled first.`
      : (data?.summary.due ?? 0) > 0
        ? `${data?.summary.due} PM item${data?.summary.due === 1 ? "" : "s"} are ready to plan.`
        : "No preventive-maintenance action is overdue.";

  return (
    <div className="space-y-5 text-[color:var(--theme-text-primary)]">
      <header className={card}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
              Fleet maintenance
            </div>
            <h1 className="mt-2 text-2xl font-semibold">PM Management</h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              One queue for due work, deferrals, service requests, and PM
              programs.
            </p>
            <p className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
              {uiContext.actorLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data && (data.fleets.length > 1 || fleetId !== "all") ? (
              <select
                value={fleetId}
                onChange={(event) => setFleetId(event.target.value)}
                className="min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-xs"
              >
                <option value="all">All fleets</option>
                {data.fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {fleet.name}
                  </option>
                ))}
              </select>
            ) : null}
            {data?.canManagePrograms ? (
              <button
                type="button"
                disabled={workingId === "workspace" || !data.fleets.length}
                onClick={() => setProgramEditor(null)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-400/35 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-700 dark:text-sky-200 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> New PM program
              </button>
            ) : null}
            {data?.canManage ? (
              <button
                type="button"
                disabled={workingId === "workspace" || !data.fleets.length}
                onClick={() =>
                  void mutate({
                    action: "evaluate",
                    fleetId: fleetId === "all" ? null : fleetId,
                  })
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-300 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" /> Re-evaluate now
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ["Overdue", data?.summary.overdue ?? 0],
            ["Due", data?.summary.due ?? 0],
            ["Deferred", data?.summary.deferred ?? 0],
            ["Request created", data?.summary.converted ?? 0],
            ["Units clear", data?.summary.clearUnits ?? 0],
          ].map(([label, value]) => (
            <button
              type="button"
              key={String(label)}
              onClick={() =>
                setFilter(
                  label === "Request created"
                    ? "converted"
                    : label === "Units clear"
                      ? "all"
                      : (String(label).toLowerCase() as Filter),
                )
              }
              className="rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-left"
            >
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                {label}
              </div>
              <div className="mt-1 text-xl font-semibold">{value}</div>
            </button>
          ))}
        </div>
      </header>

      <section className={card}>
        <div className="flex items-start gap-3">
          {(data?.summary.overdue ?? 0) > 0 ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
          )}
          <div>
            <h2 className="text-sm font-semibold">Live PM brief</h2>
            <p className="mt-1 text-sm">{headline}</p>
            <ul className="mt-2 space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
              <li>• Review overdue units, then current due units.</li>
              <li>• Every deferral requires a future date and a reason.</li>
              <li>
                • Creating a request keeps the due event linked through work
                completion.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className={card}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                "action",
                "overdue",
                "due",
                "deferred",
                "converted",
                "all",
              ] as const
            ).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={
                  filter === value
                    ? "shrink-0 rounded-full bg-sky-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
                    : "shrink-0 rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold"
                }
              >
                {value === "action"
                  ? "Needs action"
                  : value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search unit or PM program"
            className="min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm"
          />
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Loading PM data…
            </p>
          ) : null}
          {!loading &&
            filtered.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[color:var(--theme-border-soft)] p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`${routePrefix}/units/${encodeURIComponent(item.vehicleId)}`}
                        className="text-base font-semibold text-sky-200 hover:underline"
                      >
                        {item.unitLabel}
                      </Link>
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[10px] uppercase">
                        {item.urgency}
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{item.name}</h3>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {item.dueReasons.join(" • ") ||
                        "PM policy interval reached"}
                    </p>
                    <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                      {item.fleetName} • {intervalLabel(item)}
                      {item.currentOdometerKm == null
                        ? ""
                        : ` • ${item.currentOdometerKm.toLocaleString()} km`}
                      {item.currentEngineHours == null
                        ? ""
                        : ` • ${item.currentEngineHours.toLocaleString()} hours`}
                    </div>
                    {item.deferredUntil ? (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-200">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Deferred until{" "}
                        {new Date(item.deferredUntil).toLocaleDateString()}
                      </div>
                    ) : null}
                  </div>
                  {data?.canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {!item.serviceRequestId ? (
                        <button
                          type="button"
                          disabled={workingId === item.id}
                          onClick={() => {
                            setRequestItem(item);
                            setRequestedForDate(dateInputDefault());
                          }}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
                        >
                          <ClipboardPlus className="h-4 w-4" />
                          Plan request
                        </button>
                      ) : (
                        <Link
                          href={`${routePrefix}/service-requests`}
                          className="inline-flex min-h-10 items-center rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
                        >
                          View request
                        </Link>
                      )}
                      {item.urgency !== "converted" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeferItem(item);
                            setDeferUntil(dateInputDefault());
                            setDeferReason("");
                          }}
                          className="min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
                        >
                          Defer
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          {!loading && !filtered.length ? (
            <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-5 text-center text-sm text-[color:var(--theme-text-secondary)]">
              No PM items match this view.
            </div>
          ) : null}
        </div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-500 dark:text-sky-300" />
            <div>
              <h2 className="text-sm font-semibold">PM programs</h2>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">
                Fleet-owned templates, intervals, tasks, and asset assignments.
              </p>
            </div>
          </div>
          {data?.canManagePrograms ? (
            <button
              type="button"
              onClick={() => setProgramEditor(null)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-400 px-3 text-xs font-semibold text-slate-950"
            >
              <Plus className="h-4 w-4" /> Create template
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(data?.programs ?? []).map((program) => (
            <article
              key={program.id}
              className="rounded-xl border border-[color:var(--theme-border-soft)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{program.name}</h3>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {intervalLabel(program)}
                  </p>
                </div>
                <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-1 text-[10px]">
                  {program.dueUnits}/{program.assignedUnits} due
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                <span>
                  {program.tasks.length} task
                  {program.tasks.length === 1 ? "" : "s"}
                </span>
                <span>•</span>
                <span>
                  {program.assignmentMode === "all_units"
                    ? "All Fleet assets"
                    : `${program.assignedVehicleIds.length} selected assets`}
                </span>
                <span>•</span>
                <span>
                  {program.requiresFleetApproval
                    ? "Approval required"
                    : "No approval gate"}
                </span>
              </div>
              {program.notes ? (
                <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                  {program.notes}
                </p>
              ) : null}
              {data?.canManagePrograms ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[color:var(--theme-border-soft)] pt-3">
                  <button
                    type="button"
                    onClick={() => setProgramEditor(program)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={workingId === program.id}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Archive ${program.name}? Existing due items will be dismissed.`,
                        )
                      )
                        return;
                      void mutate(
                        {
                          action: "archive_program",
                          fleetId: program.fleetId,
                          programId: program.id,
                        },
                        program.id,
                      );
                    }}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-300 disabled:opacity-50"
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!loading && !(data?.programs.length ?? 0) ? (
            <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-5 text-sm text-[color:var(--theme-text-secondary)] md:col-span-2">
              Create a PM template to define recurring work and assign it to
              Fleet assets.
            </div>
          ) : null}
        </div>
      </section>

      {programEditor !== undefined && data ? (
        <FleetPmProgramEditor
          fleets={
            fleetId === "all"
              ? data.fleets
              : [
                  ...data.fleets.filter((fleet) => fleet.id === fleetId),
                  ...data.fleets.filter((fleet) => fleet.id !== fleetId),
                ]
          }
          units={data.units}
          program={programEditor}
          busy={workingId === "workspace"}
          onClose={() => setProgramEditor(undefined)}
          onSave={(body) => mutate(body)}
        />
      ) : null}

      {requestItem ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-pm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5 shadow-2xl">
            <h2 id="plan-pm-title" className="text-lg font-semibold">
              Plan {requestItem.name}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {requestItem.unitLabel} • Fleet chooses the requested date; Shop
              owns repair execution.
            </p>
            <label className="mt-4 block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Requested service date
              <input
                type="date"
                min={localDateInput()}
                value={requestedForDate}
                onChange={(event) => setRequestedForDate(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3"
              />
            </label>
            <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
              Leave the date blank to place the request in the calendar’s “Needs
              a planning date” queue.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRequestItem(null)}
                className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={workingId === requestItem.id}
                onClick={() =>
                  void (async () => {
                    const ok = await mutate(
                      {
                        action: "create_request",
                        dueEventId: requestItem.id,
                        requestedForDate: requestedForDate || null,
                      },
                      requestItem.id,
                    );
                    if (ok) setRequestItem(null);
                  })()
                }
                className="rounded-xl bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
              >
                {workingId === requestItem.id
                  ? "Creating…"
                  : "Create Fleet request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deferItem ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="defer-pm-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5 shadow-2xl">
            <h2 id="defer-pm-title" className="text-lg font-semibold">
              Defer {deferItem.name}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {deferItem.unitLabel} • A future date and reason are retained with
              the PM evidence.
            </p>
            <label className="mt-4 block text-xs">
              Review again on
              <input
                type="date"
                value={deferUntil}
                onChange={(event) => setDeferUntil(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3"
              />
            </label>
            <label className="mt-3 block text-xs">
              Reason
              <textarea
                value={deferReason}
                onChange={(event) =>
                  setDeferReason(event.target.value.slice(0, 500))
                }
                rows={3}
                className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2"
                placeholder="Example: Unit unavailable until route ends."
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeferItem(null)}
                className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !deferReason.trim() ||
                  !deferUntil ||
                  workingId === deferItem.id
                }
                onClick={() =>
                  void (async () => {
                    const ok = await mutate(
                      {
                        action: "defer",
                        dueEventId: deferItem.id,
                        deferredUntil: deferUntil,
                        reason: deferReason,
                      },
                      deferItem.id,
                    );
                    if (ok) setDeferItem(null);
                  })()
                }
                className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
              >
                Confirm deferral
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
