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
import {
  buildBlockers,
  formatStageLabel,
  stageAccent,
  timeAgoLabel,
} from "../../lib/workboard/utils";

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

function BoardRow({
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
  const accent = stageAccent(row.overall_stage, row.risk_level);
  const statusLabel = formatStageLabel(row, variant);
  const progressLabel =
    row.jobs_total > 0
      ? `${row.jobs_completed} of ${row.jobs_total} jobs complete`
      : "No jobs added";
  const card = (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-[color:var(--theme-surface-inset)] shadow-sm transition hover:-translate-y-px hover:border-[var(--brand-accent,#E39A6E)]/60 hover:shadow-md ${accent.border}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${accent.progress}`} />
      <div className="grid gap-3 px-4 py-3 pl-5 md:grid-cols-[minmax(180px,1.25fr)_minmax(160px,1fr)_minmax(180px,1.15fr)_minmax(150px,.9fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-extrabold text-[color:var(--theme-text-primary)]">
              {row.custom_id ?? "Work order"}
            </div>
            {row.is_waiter ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                Waiting
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {row.display_name ?? "Customer"}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)] md:hidden">
            Vehicle
          </div>
          <div className="truncate text-sm text-[color:var(--theme-text-primary)]">
            {row.vehicle_label || "Vehicle not listed"}
          </div>
          {row.unit_label ? (
            <div className="mt-0.5 truncate text-xs text-[color:var(--theme-text-muted)]">
              Unit {row.unit_label}
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${accent.badge}`}>
              {statusLabel}
            </span>
            {blockers[0] ? (
              <span className="truncate text-xs font-medium text-[color:var(--theme-text-secondary)]">
                {blockers[0]}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
              <div
                className={`h-full rounded-full ${accent.progress}`}
                style={{
                  width: `${Math.min(100, Math.max(0, row.progress_pct))}%`,
                }}
              />
            </div>
            <span className="shrink-0 text-[10px] text-[color:var(--theme-text-muted)]">
              {progressLabel}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-xs font-medium text-[color:var(--theme-text-secondary)]">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            {tech}
          </div>
          {row.advisor_name ? (
            <div className="mt-1 truncate text-[11px] text-[color:var(--theme-text-muted)]">
              Advisor · {row.advisor_name}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 md:justify-end">
          <span
            className={
              row.risk_level === "danger"
                ? "text-xs font-bold text-red-600"
                : "text-xs text-[color:var(--theme-text-muted)]"
            }
          >
            {timeAgoLabel(row.time_in_stage_seconds ?? null)}
          </span>
          <ChevronRight className="h-4 w-4 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-primary,#C1663B)]" />
        </div>
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
        (waiter === "all" || (waiter === "yes") === Boolean(row.is_waiter))
      );
    }).sort((a, b) => {
      const exceptionScore = (row: WorkOrderBoardRow) =>
        (row.risk_level === "danger" ? 100 : row.risk_level === "warn" ? 50 : 0) +
        (row.overall_stage === "on_hold" ? 30 : 0) +
        (row.overall_stage === "waiting_parts" ? 20 : 0) +
        (row.assigned_summary === "Unassigned" ? 10 : 0);
      return exceptionScore(b) - exceptionScore(a);
    });
  }, [advisor, query, riskOnly, rows, stageFilter, technician, waiter]);

  const count = (stage: WorkOrderBoardStage) =>
    rows.filter((row) => row.overall_stage === stage).length;
  const atRisk = rows.filter(
    (row) => row.risk_level === "warn" || row.risk_level === "danger",
  ).length;
  const hrefMode = props.hrefMode ?? defaultHrefModeForVariant(props.variant);
  const buildHref = (row: WorkOrderBoardRow) =>
    props.hrefBuilder ? props.hrefBuilder(row) : resolveHref(row, hrefMode);
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
        <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]">
          <div className="hidden grid-cols-[minmax(180px,1.25fr)_minmax(160px,1fr)_minmax(180px,1.15fr)_minmax(150px,.9fr)_auto] gap-3 border-b border-[color:var(--theme-border-soft)] px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)] md:grid">
            <span>Work order</span>
            <span>Vehicle</span>
            <span>Operational state</span>
            <span>Assigned</span>
            <span className="text-right">Age</span>
          </div>
          <div className="space-y-2 p-2">
            {filteredRows.length ? (
              filteredRows.map((row) => (
                <BoardRow
                  key={row.work_order_id}
                  row={row}
                  variant={props.variant}
                  href={buildHref(row)}
                />
              ))
            ) : (
              <EmptyColumn
                label={
                  stageFilter === "all"
                    ? "the current filters"
                    : stages.find((stage) => stage.key === stageFilter)?.label ??
                      "this stage"
                }
              />
            )}
          </div>
        </section>
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
