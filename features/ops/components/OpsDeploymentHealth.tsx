import { CheckCircle2, CircleAlert, Database, GitBranch, GitPullRequest, RefreshCw, Server, Workflow, XCircle } from "lucide-react";

import type { DeploymentHealthSnapshot, DeploymentHealthState } from "@/features/ops/server/get-deployment-health";
import { cn } from "@shared/lib/utils";

function tone(state: DeploymentHealthState): string {
  if (state === "healthy") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (state === "degraded") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
}

function label(state: DeploymentHealthState): string {
  if (state === "healthy") return "Healthy";
  if (state === "degraded") return "Needs attention";
  return "Blocked";
}

function Icon({ state }: { state: DeploymentHealthState }) {
  if (state === "healthy") return <CheckCircle2 className="h-4 w-4" />;
  if (state === "degraded") return <CircleAlert className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

function Pill({ state }: { state: DeploymentHealthState }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", tone(state))}><Icon state={state} />{label(state)}</span>;
}

function short(value: string | null): string {
  if (!value) return "Unavailable";
  return value.length > 14 ? value.slice(0, 14) : value;
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Edmonton" }).format(new Date(value));
}

export default function OpsDeploymentHealth({ snapshot }: { snapshot: DeploymentHealthSnapshot }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-500"><GitBranch className="h-4 w-4" />Release evidence</div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Deployments &amp; release health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">Native ProFixIQ release checks across the live Vercel runtime, GitHub main and CI, and authenticated production data. The retired engineering agent is no longer part of release health.</p>
        </div>
        <a href="/ops/deployments" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2.5 text-sm font-bold"><RefreshCw className="h-4 w-4" />Refresh</a>
      </section>

      <section className={cn("rounded-2xl border p-5 shadow-card", tone(snapshot.overall))}>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em]">Release posture</p><p className="mt-1 text-xl font-black">{label(snapshot.overall)}</p></div>
          <Pill state={snapshot.overall} />
        </div>
        <p className="mt-3 text-xs font-semibold opacity-80">Checked {when(snapshot.checkedAt)} MT</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card">
          <div className="flex items-start justify-between gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500"><Server className="h-5 w-5" /></span><Pill state={snapshot.production.state} /></div>
          <h2 className="mt-4 text-sm font-bold">Production commit parity</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{snapshot.production.matchesMain === true ? "Production matches GitHub main." : snapshot.production.matchesMain === false ? "Production is not serving the current main SHA." : "Runtime/main parity cannot be fully verified."}</p>
          <dl className="mt-4 space-y-2 text-xs"><div><dt className="text-[color:var(--theme-text-muted)]">Production</dt><dd className="font-mono">{short(snapshot.production.deployedSha)}</dd></div><div><dt className="text-[color:var(--theme-text-muted)]">Main</dt><dd className="font-mono">{short(snapshot.production.mainSha)}</dd></div><div><dt className="text-[color:var(--theme-text-muted)]">Deployment</dt><dd className="font-mono">{short(snapshot.production.deploymentId)}</dd></div></dl>
        </article>

        <article className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card">
          <div className="flex items-start justify-between gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><Workflow className="h-5 w-5" /></span><Pill state={snapshot.ci.state} /></div>
          <h2 className="mt-4 text-sm font-bold">CI checks</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{snapshot.ci.total} checks · {snapshot.ci.failing} failing · {snapshot.ci.pending} pending.</p>
          <div className="mt-4 max-h-44 space-y-2 overflow-y-auto">{snapshot.ci.checks.slice(0, 12).map((check) => <div key={`${check.name}-${check.detailsUrl ?? ""}`} className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs"><span className="truncate">{check.name}</span><span className="shrink-0 text-[color:var(--theme-text-muted)]">{check.conclusion ?? check.status}</span></div>)}</div>
        </article>

        <article className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card">
          <div className="flex items-start justify-between gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500"><Database className="h-5 w-5" /></span><Pill state={snapshot.database.state} /></div>
          <h2 className="mt-4 text-sm font-bold">Production data</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">Authenticated Supabase access {snapshot.database.error ? "failed" : "is responding normally"}.</p>
          <dl className="mt-4 space-y-2 text-xs"><div><dt className="text-[color:var(--theme-text-muted)]">Latency</dt><dd>{snapshot.database.latencyMs ?? 0} ms</dd></div><div><dt className="text-[color:var(--theme-text-muted)]">Feedback ledger records</dt><dd>{snapshot.database.feedbackRecords ?? "Unavailable"}</dd></div>{snapshot.database.error ? <div><dt className="text-[color:var(--theme-text-muted)]">Error</dt><dd>{snapshot.database.error}</dd></div> : null}</dl>
        </article>
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card">
        <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-bold">{snapshot.migrations.state === "down" ? "Migration parity failed" : "Migration parity"}</h2><Pill state={snapshot.migrations.state} /></div>
        <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{snapshot.migrations.note ?? "Production's migration ledger matches supabase/migrations on main."}</p>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-4"><div><dt className="text-[color:var(--theme-text-muted)]">On main</dt><dd>{snapshot.migrations.repoCount ?? "Unavailable"}</dd></div><div><dt className="text-[color:var(--theme-text-muted)]">Applied in production</dt><dd>{snapshot.migrations.appliedCount ?? "Unavailable"}</dd></div><div><dt className="text-[color:var(--theme-text-muted)]">Production only</dt><dd className="font-mono break-all">{snapshot.migrations.productionOnly.join(", ") || "None"}</dd></div><div><dt className="text-[color:var(--theme-text-muted)]">Unapplied on main</dt><dd className="font-mono break-all">{snapshot.migrations.unapplied.join(", ") || "None"}</dd></div></dl>
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 shadow-card">
        <div className="flex items-center gap-2"><GitPullRequest className="h-4 w-4 text-orange-500" /><h2 className="text-sm font-bold">Open pull requests</h2></div>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{snapshot.pullRequests.total} open · {snapshot.pullRequests.ready} ready · {snapshot.pullRequests.draft} draft.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{snapshot.pullRequests.recent.map((pull) => <a key={pull.number} href={pull.url} target="_blank" rel="noreferrer" className="rounded-xl border border-[color:var(--theme-border-soft)] p-3 text-sm hover:border-orange-500/40"><div className="font-semibold">#{pull.number} {pull.title}</div><div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{pull.draft ? "Draft" : "Ready"} · updated {when(pull.updatedAt)}</div></a>)}</div>
      </section>
    </div>
  );
}
