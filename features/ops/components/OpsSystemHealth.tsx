import {
  Activity,
  Bot,
  CheckCircle2,
  CircleAlert,
  Database,
  RefreshCw,
  Server,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type {
  OpsHealthService,
  OpsHealthState,
  OpsSystemHealthSnapshot,
} from "@/features/ops/server/get-system-health";
import { cn } from "@shared/lib/utils";

function stateLabel(state: OpsHealthState): string {
  if (state === "healthy") return "Healthy";
  if (state === "degraded") return "Degraded";
  return "Down";
}

function stateTone(state: OpsHealthState): string {
  if (state === "healthy") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (state === "degraded") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}

function stateIcon(state: OpsHealthState) {
  if (state === "healthy") return CheckCircle2;
  if (state === "degraded") return CircleAlert;
  return XCircle;
}

function serviceIcon(service: OpsHealthService) {
  if (service.key === "application") return Server;
  if (service.key === "database") return Database;
  return Bot;
}

function formatChecked(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Edmonton",
  }).format(new Date(value));
}

function ServiceCard({ service }: { service: OpsHealthService }) {
  const Icon = serviceIcon(service);
  const StateIcon = stateIcon(service.state);

  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
      <div className="flex items-start justify-between gap-4 border-b border-[color:var(--theme-border-soft)] p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-300">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold">{service.label}</h2>
            <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              {service.summary}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
            stateTone(service.state),
          )}
        >
          <StateIcon className="h-3.5 w-3.5" />
          {stateLabel(service.state)}
        </span>
      </div>

      <dl className="grid gap-px bg-[color:var(--theme-border-soft)] sm:grid-cols-2">
        {service.details.map((detail) => (
          <div
            key={`${service.key}-${detail.label}`}
            className="min-w-0 bg-[color:var(--theme-surface-inset)] px-4 py-3"
          >
            <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
              {detail.label}
            </dt>
            <dd className="mt-1 truncate font-mono text-xs text-[color:var(--theme-text-primary)]" title={detail.value}>
              {detail.value}
            </dd>
          </div>
        ))}
        <div className="bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
            Check latency
          </dt>
          <dd className="mt-1 font-mono text-xs text-[color:var(--theme-text-primary)]">
            {service.latencyMs === null ? "Local" : `${service.latencyMs} ms`}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function OpsSystemHealth({
  snapshot,
}: {
  snapshot: OpsSystemHealthSnapshot;
}) {
  const OverallIcon = stateIcon(snapshot.overall);
  const unhealthyCount = snapshot.services.filter((service) => service.state !== "healthy").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-400">
            <Activity className="h-4 w-4" />
            Production evidence
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            System health
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Live, read-only checks for the ProFixIQ application, authenticated Supabase access,
            and the Agent worker generation. A configured integration is not treated as healthy
            unless the runtime check succeeds.
          </p>
        </div>
        <a
          href="/ops/system-health"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2.5 text-sm font-bold transition hover:border-orange-500/50 hover:bg-orange-500/10"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh health
        </a>
      </section>

      <section
        className={cn(
          "flex flex-col gap-4 rounded-2xl border p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5",
          stateTone(snapshot.overall),
        )}
        aria-label="Overall production health"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/10">
            <OverallIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Overall control-plane status</p>
            <p className="mt-1 text-lg font-black">{stateLabel(snapshot.overall)}</p>
          </div>
        </div>
        <div className="text-xs sm:text-right">
          <p className="font-semibold">
            {unhealthyCount === 0
              ? "All live checks passed"
              : `${unhealthyCount} service${unhealthyCount === 1 ? "" : "s"} need attention`}
          </p>
          <p className="mt-1 opacity-80">Checked {formatChecked(snapshot.checkedAt)} MT</p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3" aria-label="Production service health">
        {snapshot.services.map((service) => (
          <ServiceCard key={service.key} service={service} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold">Mission approval safety</h2>
              <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                Agent generation must report as verified before mission approval is considered
                healthy. This prevents work compiled by an older deployment from becoming an
                actionable approval package.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold">Database check semantics</h2>
              <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                The database card performs an authenticated owner-scoped read through the same
                Supabase path used by Ops. It does not bypass RLS with a service-role health probe.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
