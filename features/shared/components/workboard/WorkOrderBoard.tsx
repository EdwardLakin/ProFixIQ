"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Package,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { useWorkOrderBoard } from "../../hooks/useWorkOrderBoard";
import type { WorkOrderBoardFilterKey } from "../../lib/workboard/filters";
import type {
  WorkOrderBoardRow,
  WorkOrderBoardStage,
  WorkOrderBoardVariant,
} from "../../lib/workboard/types";
import { buildBlockers, timeAgoLabel } from "../../lib/workboard/utils";

type FilterKey = WorkOrderBoardFilterKey;
type WorkOrderBoardHrefMode = "none" | "shop-work-order";

const stages: Array<{
  key: WorkOrderBoardStage;
  label: string;
  icon: typeof Clock3;
  tone: string;
}> = [
  { key: "awaiting", label: "Awaiting", icon: Clock3, tone: "text-blue-600" },
  {
    key: "in_progress",
    label: "In progress",
    icon: Wrench,
    tone: "text-violet-600",
  },
  {
    key: "awaiting_approval",
    label: "Awaiting approval",
    icon: ClipboardCheck,
    tone: "text-amber-600",
  },
  {
    key: "waiting_parts",
    label: "Waiting parts",
    icon: Package,
    tone: "text-orange-600",
  },
  {
    key: "completed",
    label: "Ready to invoice",
    icon: CheckCircle2,
    tone: "text-emerald-600",
  },
];

function priorityLabel(priority?: number | null) {
  return priority === 1
    ? "Urgent"
    : priority === 2
      ? "High"
      : priority === 4
        ? "Low"
        : "Normal";
}

function defaultHrefModeForVariant(
  variant: WorkOrderBoardVariant,
): WorkOrderBoardHrefMode {
  return variant === "shop" ? "shop-work-order" : "none";
}

function resolveHref(row: WorkOrderBoardRow, mode: WorkOrderBoardHrefMode) {
  return mode === "shop-work-order"
    ? `/work-orders/${row.work_order_id}`
    : null;
}

function BoardCard({
  row,
  href,
  variant,
}: {
  row: WorkOrderBoardRow;
  href: string | null;
  variant: WorkOrderBoardVariant;
}) {
  const blockers = buildBlockers(row, variant);
  const tech =
    row.tech_names?.join(", ") ||
    row.first_tech_name ||
    row.assigned_summary ||
    "Unassigned";
  const card = (
    <article className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 shadow-sm transition hover:border-[var(--brand-accent,#E39A6E)]/60 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-extrabold text-[color:var(--theme-text-primary)]">
            {row.custom_id ?? "Work order"}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {row.display_name ?? "Customer"}
          </div>
        </div>
        <span
          className={
            row.risk_level === "danger"
              ? "text-xs font-bold text-red-600"
              : "text-xs text-[color:var(--theme-text-muted)]"
          }
        >
          {timeAgoLabel(row.time_in_stage_seconds ?? null)}
        </span>
      </div>
      <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
        {[row.unit_label ? `Unit ${row.unit_label}` : null, row.vehicle_label]
          .filter(Boolean)
          .join(" · ") || "Vehicle not listed"}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${row.priority === 1 ? "bg-red-500" : "bg-blue-500"}`}
          />
          {priorityLabel(row.priority)} priority
        </span>
        {row.is_waiter ? (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-200">
            Customer waiting
          </span>
        ) : null}
        {row.overall_stage === "completed" ? (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-200">
            Ready to invoice
          </span>
        ) : null}
      </div>
      <dl className="mt-3 grid grid-cols-[78px_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-[color:var(--theme-text-muted)]">Technician</dt>
        <dd className="truncate text-[color:var(--theme-text-secondary)]">
          <UserRound className="mr-1 inline h-3.5 w-3.5" />
          {tech}
        </dd>
        {row.parts_blocker_count ? (
          <>
            <dt className="text-[color:var(--theme-text-muted)]">Parts</dt>
            <dd>
              {row.parts_blocker_count} request
              {row.parts_blocker_count === 1 ? "" : "s"}
            </dd>
          </>
        ) : null}
        <dt className="text-[color:var(--theme-text-muted)]">Job progress</dt>
        <dd>{row.progress_pct}%</dd>
        <dt className="text-[color:var(--theme-text-muted)]">Blocking</dt>
        <dd className="truncate">{blockers[0] ?? "—"}</dd>
      </dl>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
        <div
          className={`h-full rounded-full ${row.overall_stage === "completed" ? "bg-emerald-500" : "bg-[var(--brand-primary,#C1663B)]"}`}
          style={{ width: `${Math.min(100, Math.max(0, row.progress_pct))}%` }}
        />
      </div>
      <div className="mt-3 flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--brand-primary,#C1663B)]/45 text-xs font-semibold text-[var(--brand-primary,#C1663B)]">
        {row.overall_stage === "completed"
          ? "Review invoice"
          : row.overall_stage === "waiting_parts"
            ? "Open parts"
            : row.overall_stage === "awaiting"
              ? "Assign"
              : "Open work order"}
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </article>
  );
  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function EmptyColumn({ label }: { label: string }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-5 text-center">
      <div>
        <ClipboardCheck className="mx-auto h-10 w-10 text-[color:var(--theme-text-muted)]" />
        <div className="mt-3 text-sm font-semibold text-[color:var(--theme-text-secondary)]">
          No work orders
        </div>
        <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
          Work appears here when it moves to {label.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}

export default function WorkOrderBoard(props: {
  variant: WorkOrderBoardVariant;
  title: string;
  subtitle?: string;
  limit?: number;
  fleetId?: string | null;
  compact?: boolean;
  hrefMode?: WorkOrderBoardHrefMode;
  hrefBuilder?: (row: WorkOrderBoardRow) => string | null;
  initialStage?: FilterKey;
}) {
  const { rows, loading, error, refetch } = useWorkOrderBoard(props.variant, {
    limit: props.limit,
    fleetId: props.fleetId,
  });
  const [stageFilter, setStageFilter] = useState<FilterKey>(
    props.initialStage ?? "all",
  );
  const [riskOnly, setRiskOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [advisor, setAdvisor] = useState("all");
  const [technician, setTechnician] = useState("all");
  const [priority, setPriority] = useState("all");
  const [waiter, setWaiter] = useState("all");

  useEffect(() => {
    setStageFilter(props.initialStage ?? "all");
    setRiskOnly(false);
  }, [props.initialStage]);

  const advisorOptions = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => row.advisor_name)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [rows],
  );
  const techOptions = useMemo(
    () =>
      [
        ...new Set(
          rows.flatMap((row) =>
            row.tech_names?.length
              ? row.tech_names
              : row.first_tech_name
                ? [row.first_tech_name]
                : [],
          ),
        ),
      ].sort(),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const searchable = [
        row.custom_id,
        row.display_name,
        row.unit_label,
        row.vehicle_label,
        row.advisor_name,
        row.first_tech_name,
        ...(row.tech_names ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (stageFilter === "all" || row.overall_stage === stageFilter) &&
        (!riskOnly ||
          row.risk_level === "warn" ||
          row.risk_level === "danger") &&
        (!q || searchable.includes(q)) &&
        (advisor === "all" || row.advisor_name === advisor) &&
        (technician === "all" ||
          row.first_tech_name === technician ||
          row.tech_names?.includes(technician)) &&
        (priority === "all" || String(row.priority ?? 3) === priority) &&
        (waiter === "all" || (waiter === "yes") === Boolean(row.is_waiter))
      );
    });
  }, [advisor, priority, query, riskOnly, rows, stageFilter, technician, waiter]);

  const count = (stage: WorkOrderBoardStage) =>
    rows.filter((row) => row.overall_stage === stage).length;
  const atRisk = rows.filter(
    (row) => row.risk_level === "warn" || row.risk_level === "danger",
  ).length;
  const hrefMode = props.hrefMode ?? defaultHrefModeForVariant(props.variant);
  const buildHref = (row: WorkOrderBoardRow) =>
    props.hrefBuilder ? props.hrefBuilder(row) : resolveHref(row, hrefMode);
  const visibleStages =
    stageFilter === "all"
      ? stages
      : stageFilter === "on_hold"
        ? stages.filter((stage) => stage.key === "waiting_parts")
        : stages.filter((stage) => stage.key === stageFilter);
  const summaryCards: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    tone: string;
    filter: "risk" | Exclude<WorkOrderBoardStage, "empty">;
  }> = [
    {
      label: "At risk",
      value: atRisk,
      icon: AlertTriangle,
      tone: "text-orange-600",
      filter: "risk",
    },
    {
      label: "Ready to work",
      value: count("awaiting"),
      icon: CheckCircle2,
      tone: "text-blue-600",
      filter: "awaiting",
    },
    {
      label: "Waiting parts",
      value: count("waiting_parts"),
      icon: Clock3,
      tone: "text-amber-600",
      filter: "waiting_parts",
    },
    {
      label: "Ready to invoice",
      value: count("completed"),
      icon: ClipboardCheck,
      tone: "text-emerald-600",
      filter: "completed",
    },
  ];

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[color:var(--theme-text-primary)]">
            {props.title}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            {rows.length} work orders ·{" "}
            <span className="font-semibold text-[var(--brand-primary,#C1663B)]">
              {atRisk} need attention
            </span>
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-end gap-2 xl:justify-end">
          <label className="relative min-w-[240px] flex-1 xl:max-w-[380px]">
            <span className="sr-only">Search work orders</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search work order, customer, unit, advisor..."
              className="h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] pl-9 pr-3 text-sm outline-none focus:border-[var(--brand-primary,#C1663B)]"
            />
          </label>
          <Filter
            label="Advisor"
            value={advisor}
            onChange={setAdvisor}
            options={advisorOptions.map((value) => [value, value])}
          />
          <Filter
            label="Technician"
            value={technician}
            onChange={setTechnician}
            options={techOptions.map((value) => [value, value])}
          />
          <Filter
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              ["1", "Urgent"],
              ["2", "High"],
              ["3", "Normal"],
              ["4", "Low"],
            ]}
          />
          <Filter
            label="Waiter"
            value={waiter}
            onChange={setWaiter}
            options={[
              ["yes", "Yes"],
              ["no", "No"],
            ]}
          />
          {props.variant === "shop" ? (
            <Link
              href="/work-orders/create"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--brand-primary,#C1663B)] px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Create work order
            </Link>
          ) : null}
          <button
            type="button"
            onClick={refetch}
            aria-label="Refresh board"
            className="grid h-11 w-11 place-items-center rounded-lg border border-[color:var(--theme-border-soft)]"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, tone, filter }) => {
          const selected =
            filter === "risk"
              ? riskOnly
              : !riskOnly && stageFilter === filter;
          return (
            <button
              key={String(label)}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                if (filter === "risk") {
                  setRiskOnly((current) => !current);
                  setStageFilter("all");
                  return;
                }
                setRiskOnly(false);
                setStageFilter(selected ? "all" : filter);
              }}
              className={`flex items-center gap-3 rounded-xl border bg-[color:var(--theme-surface-inset)] px-4 py-3 text-left transition hover:border-[var(--brand-primary,#C1663B)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary,#C1663B)]/60 ${
                selected
                  ? "border-[var(--brand-primary,#C1663B)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-primary,#C1663B)_35%,transparent)]"
                  : "border-[color:var(--theme-border-soft)]"
              }`}
            >
              <Icon className={`h-5 w-5 ${tone}`} />
              <span className="flex-1 text-sm font-semibold">{label}</span>
              <strong className={`text-xl ${tone}`}>{value}</strong>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid min-h-96 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] text-sm text-[color:var(--theme-text-secondary)]">
          Loading work order board…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div
            className={`grid min-w-[1280px] gap-3 ${visibleStages.length === 1 ? "grid-cols-1" : "grid-cols-5"}`}
          >
            {visibleStages.map((stage) => {
              const Icon = stage.icon;
              const stageRows = filteredRows.filter((row) =>
                stageFilter === "on_hold"
                  ? row.overall_stage === "on_hold"
                  : row.overall_stage === stage.key ||
                    (stageFilter === "all" &&
                      stage.key === "waiting_parts" &&
                      row.overall_stage === "on_hold"),
              );
              return (
                <section
                  key={stage.key}
                  className="min-h-[560px] rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                >
                  <header className="mb-3 flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${stage.tone}`} />
                    <h2 className="text-sm font-bold">{stage.label}</h2>
                    <span className="rounded-full bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-xs font-bold">
                      {stageRows.length}
                    </span>
                  </header>
                  <div className="space-y-2">
                    {stageRows.length ? (
                      stageRows.map((row) => (
                        <BoardCard
                          key={row.work_order_id}
                          row={row}
                          variant={props.variant}
                          href={buildHref(row)}
                        />
                      ))
                    ) : (
                      <EmptyColumn label={stage.label} />
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() =>
          setStageFilter(stageFilter === "completed" ? "all" : "completed")
        }
        className="flex w-full items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm"
      >
        <Clock3 className="h-4 w-4" />
        <span>Completed today</span>
        <strong>{count("completed")}</strong>
        <span className="text-[color:var(--theme-text-muted)]">
          · View history
        </span>
        <ChevronDown className="ml-auto h-4 w-4" />
      </button>
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="relative">
      <span className="absolute left-3 top-1.5 text-[9px] font-semibold text-[color:var(--theme-text-muted)]">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-24 appearance-none rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 pb-1 pt-4 pr-7 text-xs outline-none"
      >
        <option value="all">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
    </label>
  );
}
