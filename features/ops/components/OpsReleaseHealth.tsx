import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Database,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  Server,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";
import type { OpsReleaseHealthSnapshot } from "@/features/ops/server/get-release-health";
import { cn } from "@shared/lib/utils";

type ReleaseState = OpsReleaseHealthSnapshot["overall"];

function stateLabel(state: ReleaseState): string {
  if (state === "healthy") return "Healthy";
  if (state === "degraded") return "Needs attention";
  return "Blocked";
}

function stateTone(state: ReleaseState): string {
  if (state === "healthy") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (state === "degraded") return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
}

function StateIcon({ state }: { state: ReleaseState }) {
  if (state === "healthy") return <CheckCircle2 className="h-4 w-4" />;
  if (state === "degraded") return <CircleAlert className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : "Unavailable";
}

function shortId(value: string | null): string {
  if (!value) return "Unavailable";
  return value.length > 22 ? `${value.slice(0, 22)}…` : value;
}

function formatTime(value: string | null): string {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(new Date(value));
}

function StatusPill({ state, label }: { state: ReleaseState; label?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
      stateTone(state),
    )}>
      <StateIcon state={state} />
      {label ?? stateLabel(state)}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-[color:var(--theme-surface-inset)] px-4 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs text-[color:var(--theme-text-primary)]" title={value}>{value}</dd>
    </div>
  );
}

function migrationStatusLabel(status: OpsReleaseHealthSnapshot["migrations"]["status"]): string {
  if (status === "not_required") return "Not required";
  if (status === "applied") return "Applied / coherent";
  if (status === "pending") return "Pending";
  if (status === "drift") return "Ledger drift";
  if (status === "failed") return "Failed";
  return "Unknown";
}

export default function OpsReleaseHealth({ snapshot }: { snapshot: OpsReleaseHealthSnapshot }) {
  const ciUnavailable = snapshot.ci.canonicalName === "Unavailable"
    || snapshot.ci.conclusion === null;
  const migrationParityFailed = snapshot.migrations.pending.length > 0
    || snapshot.migrations.drift.length > 0
    || snapshot.migrations.status === "failed";
  const releaseIssues = [
    snapshot.production.state !== "healthy"
      ? {
          id: "app-release-evidence",
          title: "App commit parity needs attention",
          explanation: snapshot.production.behindMain
            ? "Production is serving an older commit than GitHub main."
            : "The production deployment identity could not be verified.",
        }
      : null,
    snapshot.agent.state !== "healthy"
      ? {
          id: "agent-release-evidence",
          title: "Agent generation evidence needs attention",
          explanation: "The Agent runtime or its deployment fingerprint could not be verified.",
        }
      : null,
    snapshot.ci.state !== "healthy"
      ? {
          id: "ci-evidence",
          title: ciUnavailable ? "CI verification is unavailable" : "Release CI needs attention",
          explanation: ciUnavailable
            ? "No canonical CI result is available; zero recorded failures is not proof that CI passed."
            : `${snapshot.ci.failingChecks} completed check${snapshot.ci.failingChecks === 1 ? "" : "s"} failed.`,
        }
      : null,
    snapshot.migrations.state !== "healthy"
      ? {
          id: "migration-evidence",
          title: migrationParityFailed ? "Migration parity failed" : "Migration evidence is unavailable",
          explanation: migrationParityFailed
            ? "The repository and production ledgers do not contain the same migration identities."
            : "The production migration ledger could not be verified.",
        }
      : null,
    snapshot.failures.state !== "healthy"
      ? {
          id: "release-failure-evidence",
          title: snapshot.failures.countSinceRelease === null
            ? "Failure capture is unverified"
            : "Failures were captured after release",
          explanation: snapshot.failures.countSinceRelease === null
            ? "Operational failure evidence could not be retrieved."
            : `${snapshot.failures.countSinceRelease} captured failure${snapshot.failures.countSinceRelease === 1 ? "" : "s"} need inspection.`,
        }
      : null,
  ].filter((issue): issue is { id: string; title: string; explanation: string } => issue !== null);
  const migrationSummary = snapshot.migrations.status === "pending"
    ? `${snapshot.migrations.pending.length} repository migration${snapshot.migrations.pending.length === 1 ? "" : "s"} not applied in production.`
    : snapshot.migrations.status === "drift"
      ? `${snapshot.migrations.drift.length} production ledger version${snapshot.migrations.drift.length === 1 ? "" : "s"} are missing from main.`
      : snapshot.migrations.status === "failed"
        ? "The Supabase release check reports a failure."
        : snapshot.migrations.status === "not_required"
          ? "The deployed release did not add a migration and the ledger matches main."
          : snapshot.migrations.status === "applied"
            ? "Repository migrations and the production migration ledger are coherent."
            : "Migration evidence is unavailable.";

  const failureSummary = snapshot.failures.countSinceRelease === null
    ? "Production failure evidence is unavailable."
    : snapshot.failures.countSinceRelease === 0
      ? "No operational capture failures have been recorded since this release."
      : `${snapshot.failures.countSinceRelease} operational capture failure${snapshot.failures.countSinceRelease === 1 ? "" : "s"} recorded since this release.`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-500">
            <GitBranch className="h-4 w-4" />
            Release evidence
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Deployments &amp; release health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Correlates the live Vercel runtime, GitHub main and CI, the Agent generation,
            and the production Supabase migration ledger. This page is read-only.
          </p>
        </div>
        <a
          href="/ops/deployments"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2.5 text-sm font-bold transition hover:border-orange-500/50 hover:bg-orange-500/10"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh release health
        </a>
      </section>

      <section className={cn("rounded-2xl border p-4 shadow-card sm:p-5", stateTone(snapshot.overall))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-black/5 dark:bg-black/10">
              <StateIcon state={snapshot.overall} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em]">Release posture</p>
              <p className="mt-1 text-lg font-black">{stateLabel(snapshot.overall)}</p>
            </div>
          </div>
          <p className="text-xs font-semibold opacity-80">Checked {formatTime(snapshot.checkedAt)} MT</p>
        </div>
        {releaseIssues.length > 0 ? (
          <div className="mt-4 border-t border-current/15 pt-4">
            <p className="text-sm font-semibold">
              {snapshot.overall === "down" ? "Blocked by" : "Needs attention from"}{" "}
              {releaseIssues.length} release gate{releaseIssues.length === 1 ? "" : "s"}: {releaseIssues.map((issue) => issue.title).join("; ")}.
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <a
                href={`#${releaseIssues[0]?.id ?? "ci-evidence"}`}
                className="inline-flex items-center justify-center rounded-lg border border-current/30 bg-black/5 px-3 py-2 text-xs font-bold transition hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                Inspect {releaseIssues.length} issue{releaseIssues.length === 1 ? "" : "s"}
              </a>
              <details className="max-w-2xl rounded-lg border border-current/20 bg-black/5 px-3 py-2 text-xs dark:bg-white/5">
                <summary className="cursor-pointer font-bold">Explain blockers</summary>
                <ul className="mt-2 space-y-2">
                  {releaseIssues.map((issue) => (
                    <li key={issue.id}>
                      <a href={`#${issue.id}`} className="font-semibold underline-offset-2 hover:underline">{issue.title}</a>
                      <span className="opacity-80"> — {issue.explanation}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 opacity-75">This explanation is read-only and derived from the release evidence shown below.</p>
              </details>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article id="app-release-evidence" className="scroll-mt-6 overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--theme-border-soft)] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500"><Server className="h-5 w-5" /></span>
              <div>
                <h2 className="text-sm font-bold">App commit parity</h2>
                <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                  {snapshot.production.behindMain === false
                    ? "The live application SHA matches GitHub main."
                    : snapshot.production.behindMain === true
                      ? "Production is serving an older SHA than GitHub main."
                      : "Runtime/main parity could not be verified."}
                </p>
              </div>
            </div>
            <StatusPill state={snapshot.production.state} />
          </div>
          <dl className="grid gap-px bg-[color:var(--theme-border-soft)] sm:grid-cols-2">
            <Detail label="Production commit" value={shortSha(snapshot.production.commitSha)} />
            <Detail label="Expected main" value={shortSha(snapshot.production.expectedMainSha)} />
            <Detail label="Deployment" value={shortId(snapshot.production.deploymentId)} />
            <Detail label="Environment" value={snapshot.production.environment} />
            <Detail label="Release commit time" value={formatTime(snapshot.production.releaseCommitAt)} />
            <Detail label="Release PR (metadata)" value={snapshot.production.releasePr ? `#${snapshot.production.releasePr.number} ${snapshot.production.releasePr.title}` : "Unavailable — non-blocking"} />
          </dl>
        </article>

        <article id="agent-release-evidence" className="scroll-mt-6 overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--theme-border-soft)] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500"><Bot className="h-5 w-5" /></span>
              <div>
                <h2 className="text-sm font-bold">Agent reachability &amp; generation integrity</h2>
                <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                  {snapshot.agent.generationVerified
                    ? "The Agent is reachable and its production generation is cryptographically fingerprinted."
                    : "The Agent generation cannot currently be verified."}
                </p>
              </div>
            </div>
            <StatusPill state={snapshot.agent.state} />
          </div>
          <dl className="grid gap-px bg-[color:var(--theme-border-soft)] sm:grid-cols-2">
            <Detail label="Agent commit" value={shortSha(snapshot.agent.commitSha)} />
            <Detail label="Deployment" value={shortId(snapshot.agent.deploymentId)} />
            <Detail label="Generation" value={snapshot.agent.generationVerified ? "Verified" : "Unverified"} />
            <Detail label="Fingerprint" value={snapshot.agent.fingerprint ? snapshot.agent.fingerprint.slice(0, 20) : "Unavailable"} />
          </dl>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article id="ci-evidence" className="scroll-mt-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><Workflow className="h-5 w-5" /></span>
            <StatusPill
              state={snapshot.ci.state}
              label={ciUnavailable ? "Blocking — no CI evidence" : undefined}
            />
          </div>
          <h2 className="mt-4 text-sm font-bold">{ciUnavailable ? "CI verification unavailable" : "Latest release CI"}</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            {ciUnavailable
              ? "No canonical result is available. No completed checks are known to be failing, but absence of evidence is not a passing result."
              : `Canonical check: ${snapshot.ci.canonicalName}. ${snapshot.ci.failingChecks === 0 ? "No completed checks are failing." : `${snapshot.ci.failingChecks} completed checks failed.`}`}
          </p>
          <div className="mt-4 grid gap-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Conclusion</span><span className="font-mono">{snapshot.ci.conclusion ?? "Unavailable"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Completed</span><span>{formatTime(snapshot.ci.completedAt)}</span></div>
          </div>
          <a
            href={snapshot.ci.detailsUrl ?? `https://github.com/EdwardLakin/ProFixIQ/commit/${snapshot.production.commitSha ?? snapshot.production.expectedMainSha ?? "main"}/checks`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-lg border border-violet-500/30 px-3 py-2 text-xs font-bold text-violet-600 transition hover:bg-violet-500/10 dark:text-violet-300"
          >
            Inspect CI evidence
          </a>
        </article>

        <article id="migration-evidence" className="scroll-mt-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><Database className="h-5 w-5" /></span>
            <StatusPill
              state={snapshot.migrations.state}
              label={migrationParityFailed ? "Blocking — parity failed" : undefined}
            />
          </div>
          <h2 className="mt-4 text-sm font-bold">{migrationParityFailed ? "Migration parity failed" : "Migration release state"}</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{migrationSummary}</p>
          <div className="mt-4 grid gap-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Status</span><span className="font-semibold">{migrationStatusLabel(snapshot.migrations.status)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Release migrations</span><span className="font-mono">{snapshot.migrations.releaseMigrationCount}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Main / production</span><span className="font-mono">{snapshot.migrations.repoCount} / {snapshot.migrations.appliedCount ?? "Unavailable"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Supabase check</span><span className="font-mono">{snapshot.migrations.supabaseCheck ?? "Unavailable"}</span></div>
          </div>
          {(snapshot.migrations.pending.length > 0 || snapshot.migrations.drift.length > 0) ? (
            <a href="#migration-reconciliation" className="mt-4 inline-flex rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/10 dark:text-emerald-300">
              Compare migration ledgers
            </a>
          ) : null}
        </article>

        <article id="release-failure-evidence" className="scroll-mt-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><ShieldCheck className="h-5 w-5" /></span>
            <StatusPill
              state={snapshot.failures.state}
              label={snapshot.failures.countSinceRelease === null ? "Unverified" : undefined}
            />
          </div>
          <h2 className="mt-4 text-sm font-bold">Failures since release</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{failureSummary}</p>
          <div className="mt-4 grid gap-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Since</span><span>{formatTime(snapshot.failures.since)}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Unresolved total</span><span className="font-mono">{snapshot.failures.unresolved ?? "Unavailable"}</span></div>
            <div className="flex justify-between gap-3"><span className="text-[color:var(--theme-text-muted)]">Latest captured</span><span>{formatTime(snapshot.failures.latestAt)}</span></div>
          </div>
        </article>
      </section>

      {(snapshot.migrations.pending.length > 0 || snapshot.migrations.drift.length > 0) ? (
        <section id="migration-reconciliation" className="scroll-mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-card sm:p-5">
          <h2 className="text-sm font-bold">Migration reconciliation required</h2>
          <p className="mt-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Equal totals do not prove parity. Inspect the filenames, SQL, checksums, and ledger timestamps before choosing a repair; ledger history must not be rewritten from this read-only page.
          </p>
          {snapshot.migrations.pending.length > 0 ? (
            <p className="mt-2 break-words font-mono text-xs text-[color:var(--theme-text-secondary)]">In main, not production: {snapshot.migrations.pending.join(", ")}</p>
          ) : null}
          {snapshot.migrations.drift.length > 0 ? (
            <p className="mt-2 break-words font-mono text-xs text-[color:var(--theme-text-secondary)]">In production, not main: {snapshot.migrations.drift.join(", ")}</p>
          ) : null}
          <Link href="/ops/agent-control" className="mt-4 inline-flex rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-500/10 dark:text-amber-300">
            Open Agent Control for a fix plan
          </Link>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
        <div className="flex flex-col gap-3 border-b border-[color:var(--theme-border-soft)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="flex items-center gap-2"><GitPullRequest className="h-4 w-4 text-orange-500" /><h2 className="text-sm font-bold">Open PRs waiting on main</h2></div>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{snapshot.pullRequests.ready} review-ready · {snapshot.pullRequests.draft} draft · {snapshot.pullRequests.total} total</p>
          </div>
          <a href="https://github.com/EdwardLakin/ProFixIQ/pulls" target="_blank" rel="noreferrer" className="text-xs font-bold text-orange-500 hover:text-orange-400">Open GitHub PRs</a>
        </div>
        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {snapshot.pullRequests.recent.length === 0 ? (
            <p className="p-5 text-sm text-[color:var(--theme-text-secondary)]">No open pull requests against main.</p>
          ) : snapshot.pullRequests.recent.map((pull) => (
            <a key={pull.number} href={pull.url} target="_blank" rel="noreferrer" className="flex flex-col gap-2 px-4 py-3 transition hover:bg-[color:var(--theme-surface-subtle)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">#{pull.number} {pull.title}</p>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">Updated {formatTime(pull.updatedAt)}</p>
              </div>
              <span className={cn("w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", pull.draft ? "border-slate-400/30 bg-slate-500/10 text-[color:var(--theme-text-secondary)]" : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300")}>{pull.draft ? "Draft" : "Ready"}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Release evidence sources">
        {[
          { label: "GitHub evidence retrieval", state: snapshot.sources.github, detail: "Commit, pull request, and check evidence." },
          {
            label: "Supabase evidence retrieval",
            state: snapshot.sources.database,
            detail: snapshot.sources.database === "healthy" && snapshot.migrations.state !== "healthy"
              ? "Ledger read succeeded; migration parity failed."
              : "Production ledger evidence retrieval.",
          },
          { label: "Agent evidence retrieval", state: snapshot.sources.agent, detail: "Runtime generation and release evidence." },
        ].map((source) => (
          <div key={source.label} className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
            <span>
              <span className="block text-xs font-semibold">{source.label}</span>
              <span className="mt-1 block text-[10px] leading-4 text-[color:var(--theme-text-muted)]">{source.detail}</span>
            </span>
            <StatusPill state={source.state} />
          </div>
        ))}
      </section>

      <div className="text-xs text-[color:var(--theme-text-muted)]">
        <Link href="/ops/system-health" className="font-semibold text-orange-500 hover:text-orange-400">System Health</Link>
        <span> remains the live service-availability view; this page answers release/version parity.</span>
      </div>
    </div>
  );
}
