import "server-only";

import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { resolveAgentApiSecrets } from "@/features/shared/lib/server/agent-api-secrets";

const GITHUB_REPOSITORY = "EdwardLakin/ProFixIQ";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
const GITHUB_CACHE_SECONDS = 60;

type ReleaseState = "healthy" | "degraded" | "down";

type GithubCommit = {
  sha: string;
  commit: {
    message: string;
    author: { date: string | null } | null;
    committer: { date: string | null } | null;
  };
  parents: Array<{ sha: string }>;
};

type GithubPull = {
  number: number;
  title: string;
  draft: boolean;
  html_url: string;
  updated_at: string;
  head: { sha: string };
};

type GithubCheck = {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  details_url: string | null;
  app?: { slug?: string | null } | null;
};

type GithubChecks = { check_runs: GithubCheck[] };

type GithubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir" | string;
};

type AgentRuntime = {
  commitSha?: string | null;
  deploymentId?: string | null;
  fingerprint?: string | null;
  verifiable?: boolean;
};

type AgentReleaseEvidencePayload = {
  status?: string;
  runtime?: AgentRuntime;
  database?: {
    configured?: boolean;
    projectRef?: string | null;
    checkedAt?: string | null;
    since?: string | null;
    migrations?: Array<{ version?: unknown; name?: unknown }>;
    failuresSince?: unknown;
    unresolvedFailures?: unknown;
    latestFailureAt?: unknown;
    error?: unknown;
  };
};

type DatabaseMigration = { version: string; name: string };

type DatabaseReleaseSnapshot = {
  checkedAt: string | null;
  projectRef: string | null;
  since: string | null;
  migrations: DatabaseMigration[];
  failuresSince: number;
  unresolvedFailures: number;
  latestFailureAt: string | null;
};

type AgentReleaseEvidenceResult = {
  agent: OpsReleaseHealthSnapshot["agent"];
  database: {
    state: ReleaseState;
    data: DatabaseReleaseSnapshot | null;
  };
};

export type OpsReleaseHealthSnapshot = {
  checkedAt: string;
  overall: ReleaseState;
  production: {
    state: ReleaseState;
    commitSha: string | null;
    deploymentId: string | null;
    deploymentUrl: string | null;
    environment: string;
    expectedMainSha: string | null;
    behindMain: boolean | null;
    deploymentSucceeded: boolean | null;
    vercelCheck: string | null;
    releaseCommitAt: string | null;
    releasePr: { number: number; title: string; url: string; headSha: string } | null;
  };
  agent: {
    state: ReleaseState;
    commitSha: string | null;
    deploymentId: string | null;
    fingerprint: string | null;
    generationVerified: boolean;
  };
  ci: {
    state: ReleaseState;
    canonicalName: string;
    status: string;
    conclusion: string | null;
    completedAt: string | null;
    detailsUrl: string | null;
    failingChecks: number;
  };
  migrations: {
    state: ReleaseState;
    status: "applied" | "not_required" | "pending" | "drift" | "failed" | "unknown";
    requiredForRelease: boolean | null;
    releaseMigrationCount: number;
    repoCount: number;
    appliedCount: number;
    pending: string[];
    drift: string[];
    latestRepoVersion: string | null;
    latestAppliedVersion: string | null;
    supabaseCheck: string | null;
  };
  pullRequests: {
    total: number;
    ready: number;
    draft: number;
    recent: Array<{ number: number; title: string; draft: boolean; url: string; updatedAt: string }>;
  };
  failures: {
    state: ReleaseState;
    since: string | null;
    countSinceRelease: number | null;
    unresolved: number | null;
    latestAt: string | null;
  };
  sources: {
    github: ReleaseState;
    database: ReleaseState;
    agent: ReleaseState;
  };
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseReleasePrNumber(message: string | null): number | null {
  const match = message?.match(/Merge pull request #(\d+)/i);
  return match ? Number(match[1]) : null;
}

function migrationVersion(filename: string): string | null {
  const match = filename.match(/^(\d+)_.*\.sql$/);
  return match?.[1] ?? null;
}

function latest(values: string[]): string | null {
  return values.length ? [...values].sort().at(-1) ?? null : null;
}

function statusState(conclusion: string | null): ReleaseState {
  if (conclusion === "success" || conclusion === "neutral" || conclusion === "skipped") return "healthy";
  if (!conclusion) return "degraded";
  return "down";
}

function isSuccessfulConclusion(conclusion: string | null): boolean {
  return conclusion === "success" || conclusion === "neutral" || conclusion === "skipped";
}

async function githubJson<T>(path: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  const token = text(process.env.OPS_GITHUB_TOKEN) ?? text(process.env.GITHUB_TOKEN);
  try {
    const response = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ProFixIQ-Ops",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: GITHUB_CACHE_SECONDS },
    });
    const data = response.ok ? (await response.json()) as T : null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function normalizeAgentRuntime(runtime: AgentRuntime | undefined): OpsReleaseHealthSnapshot["agent"] {
  const fingerprint = text(runtime?.fingerprint);
  const verified = runtime?.verifiable === true && Boolean(fingerprint);
  return {
    state: verified ? "healthy" : runtime ? "degraded" : "down",
    commitSha: text(runtime?.commitSha),
    deploymentId: text(runtime?.deploymentId),
    fingerprint,
    generationVerified: verified,
  };
}

async function publicAgentRuntime(baseUrl: string): Promise<OpsReleaseHealthSnapshot["agent"]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: { runtime?: AgentRuntime } | null = null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      payload = isRecord(parsed) ? parsed as { runtime?: AgentRuntime } : null;
    } catch {
      payload = null;
    }
    return normalizeAgentRuntime(payload?.runtime);
  } catch {
    return normalizeAgentRuntime(undefined);
  } finally {
    clearTimeout(timeout);
  }
}

async function agentReleaseEvidence(since: string): Promise<AgentReleaseEvidenceResult> {
  const baseUrl = text(process.env.PROFIXIQ_AGENT_URL)?.replace(/\/+$/, "") ?? null;
  if (!baseUrl) {
    return {
      agent: normalizeAgentRuntime(undefined),
      database: { state: "degraded", data: null },
    };
  }

  const secret = resolveAgentApiSecrets().primary;
  if (!secret) {
    return {
      agent: await publicAgentRuntime(baseUrl),
      database: { state: "degraded", data: null },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(
      `${baseUrl}/ops/release-evidence?since=${encodeURIComponent(since)}`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "x-agent-api-secret": secret,
        },
      },
    );
    const raw = await response.text();
    let payload: AgentReleaseEvidencePayload | null = null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      payload = isRecord(parsed) ? parsed as AgentReleaseEvidencePayload : null;
    } catch {
      payload = null;
    }

    if (!payload) {
      return {
        agent: await publicAgentRuntime(baseUrl),
        database: { state: "degraded", data: null },
      };
    }

    const agent = normalizeAgentRuntime(payload.runtime);
    const database = payload.database;
    const databaseError = text(database?.error);
    const migrations = Array.isArray(database?.migrations)
      ? database.migrations.flatMap((entry) => {
          const version = text(entry?.version);
          const name = text(entry?.name);
          return version && name ? [{ version, name }] : [];
        })
      : [];
    const databaseHealthy = response.ok
      && payload.status === "ok"
      && database?.configured === true
      && !databaseError;

    return {
      agent,
      database: {
        state: databaseHealthy ? "healthy" : "degraded",
        data: database ? {
          checkedAt: text(database.checkedAt),
          projectRef: text(database.projectRef),
          since: text(database.since),
          migrations,
          failuresSince: numberValue(database.failuresSince),
          unresolvedFailures: numberValue(database.unresolvedFailures),
          latestFailureAt: text(database.latestFailureAt),
        } : null,
      },
    };
  } catch {
    return {
      agent: await publicAgentRuntime(baseUrl),
      database: { state: "degraded", data: null },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function overallState(states: ReleaseState[]): ReleaseState {
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  return "healthy";
}

export async function getOpsReleaseHealth(): Promise<OpsReleaseHealthSnapshot> {
  await requireOpsOperatorPageAccess();

  const checkedAt = new Date().toISOString();
  const deployedSha = text(process.env.VERCEL_GIT_COMMIT_SHA);
  const deploymentId = text(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentUrl = text(process.env.VERCEL_URL);
  const environment = text(process.env.VERCEL_ENV) ?? text(process.env.NODE_ENV) ?? "unknown";

  const [mainResult, openPullsResult, mainMigrationsResult] = await Promise.all([
    githubJson<GithubCommit>("/commits/main"),
    githubJson<GithubPull[]>("/pulls?state=open&base=main&per_page=100&sort=updated&direction=desc"),
    githubJson<GithubContentItem[]>("/contents/supabase/migrations?ref=main"),
  ]);

  const mainCommit = mainResult.data;
  const mainSha = text(mainCommit?.sha);
  const deployedCommitResult = deployedSha && deployedSha !== mainSha
    ? await githubJson<GithubCommit>(`/commits/${encodeURIComponent(deployedSha)}`)
    : mainResult;
  const deployedCommit = deployedCommitResult.data;
  const deployedCommitAt = text(deployedCommit?.commit.committer?.date) ?? text(deployedCommit?.commit.author?.date);
  const since = deployedCommitAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const releasePrNumber = parseReleasePrNumber(text(deployedCommit?.commit.message));
  const releasePrResult = releasePrNumber
    ? await githubJson<GithubPull>(`/pulls/${releasePrNumber}`)
    : { ok: true, status: 200, data: null as GithubPull | null };
  const releasePr = releasePrResult.data;
  const parentSha = deployedCommit?.parents?.[0]?.sha ?? null;

  const [releaseChecksResult, mergeChecksResult, deployedMigrationsResult, parentMigrationsResult, infrastructure] = await Promise.all([
    releasePr?.head.sha
      ? githubJson<GithubChecks>(`/commits/${encodeURIComponent(releasePr.head.sha)}/check-runs?per_page=100`)
      : Promise.resolve({ ok: true, status: 200, data: { check_runs: [] } as GithubChecks }),
    deployedSha
      ? githubJson<GithubChecks>(`/commits/${encodeURIComponent(deployedSha)}/check-runs?per_page=100`)
      : Promise.resolve({ ok: false, status: 0, data: null as GithubChecks | null }),
    deployedSha && deployedSha !== mainSha
      ? githubJson<GithubContentItem[]>(`/contents/supabase/migrations?ref=${encodeURIComponent(deployedSha)}`)
      : Promise.resolve(mainMigrationsResult),
    parentSha
      ? githubJson<GithubContentItem[]>(`/contents/supabase/migrations?ref=${encodeURIComponent(parentSha)}`)
      : Promise.resolve({ ok: true, status: 200, data: [] as GithubContentItem[] }),
    agentReleaseEvidence(since),
  ]);

  const releaseChecks = releaseChecksResult.data?.check_runs ?? [];
  const canonicalCheck = [...releaseChecks]
    .filter((check) => check.name === "checks" && check.app?.slug === "github-actions")
    .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""))[0]
    ?? [...releaseChecks]
      .filter((check) => check.app?.slug === "github-actions" && check.status === "completed")
      .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""))[0]
    ?? null;
  const failingChecks = releaseChecks.filter(
    (check) => check.status === "completed" && !isSuccessfulConclusion(check.conclusion),
  ).length;
  const ciState = canonicalCheck ? statusState(canonicalCheck.conclusion) : "degraded";

  const mergeChecks = mergeChecksResult.data?.check_runs ?? [];
  const supabaseCheck = [...mergeChecks]
    .filter((check) => check.app?.slug === "supabase")
    .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""))[0] ?? null;
  const vercelCheck = [...mergeChecks]
    .filter((check) => check.app?.slug === "vercel" || check.name.toLowerCase() === "vercel")
    .sort((a, b) => Date.parse(b.completed_at ?? "") - Date.parse(a.completed_at ?? ""))[0] ?? null;

  const repoMigrationFiles = (mainMigrationsResult.data ?? []).filter(
    (item) => item.type === "file" && migrationVersion(item.name),
  );
  const deployedMigrationFiles = (deployedMigrationsResult.data ?? []).filter(
    (item) => item.type === "file" && migrationVersion(item.name),
  );
  const parentMigrationNames = new Set((parentMigrationsResult.data ?? []).map((item) => item.name));
  const releaseMigrationFiles = deployedMigrationFiles.filter((item) => !parentMigrationNames.has(item.name));

  const repoVersions = repoMigrationFiles.flatMap((item) => {
    const version = migrationVersion(item.name);
    return version ? [version] : [];
  });
  const appliedVersions = infrastructure.database.data?.migrations.map((migration) => migration.version) ?? [];
  const repoSet = new Set(repoVersions);
  const appliedSet = new Set(appliedVersions);
  const pending = repoVersions.filter((version) => !appliedSet.has(version)).sort();
  const drift = appliedVersions.filter((version) => !repoSet.has(version)).sort();
  const migrationsRequired = parentSha ? releaseMigrationFiles.length > 0 : null;

  let migrationStatus: OpsReleaseHealthSnapshot["migrations"]["status"] = "unknown";
  if (infrastructure.database.state !== "healthy") migrationStatus = "unknown";
  else if (supabaseCheck?.conclusion && !isSuccessfulConclusion(supabaseCheck.conclusion)) migrationStatus = "failed";
  else if (drift.length > 0) migrationStatus = "drift";
  else if (pending.length > 0) migrationStatus = "pending";
  else if (migrationsRequired === false) migrationStatus = "not_required";
  else migrationStatus = "applied";

  const migrationState: ReleaseState = migrationStatus === "applied" || migrationStatus === "not_required"
    ? "healthy"
    : migrationStatus === "pending" || migrationStatus === "unknown"
      ? "degraded"
      : "down";

  const behindMain = deployedSha && mainSha ? deployedSha !== mainSha : null;
  const runtimeServing = Boolean(deployedSha && deploymentId);
  const deploymentSucceeded = runtimeServing
    ? vercelCheck?.conclusion && !isSuccessfulConclusion(vercelCheck.conclusion)
      ? false
      : true
    : null;
  const productionState: ReleaseState = !runtimeServing
    ? "down"
    : deploymentSucceeded === false
      ? "down"
      : behindMain === true
        ? "degraded"
        : "healthy";

  const pulls = openPullsResult.data ?? [];
  const recentPulls = pulls.slice(0, 8).map((pull) => ({
    number: pull.number,
    title: pull.title,
    draft: pull.draft,
    url: pull.html_url,
    updatedAt: pull.updated_at,
  }));

  const failureState: ReleaseState = infrastructure.database.state !== "healthy"
    ? "degraded"
    : (infrastructure.database.data?.failuresSince ?? 0) > 0
      ? "degraded"
      : "healthy";

  const githubHealthy = mainResult.ok
    && openPullsResult.ok
    && mainMigrationsResult.ok
    && deployedCommitResult.ok
    && releasePrResult.ok
    && releaseChecksResult.ok
    && mergeChecksResult.ok;
  const githubState: ReleaseState = githubHealthy ? "healthy" : mainResult.ok ? "degraded" : "down";

  const states = [
    productionState,
    infrastructure.agent.state,
    ciState,
    migrationState,
    failureState,
    githubState,
    infrastructure.database.state,
  ];

  return {
    checkedAt,
    overall: overallState(states),
    production: {
      state: productionState,
      commitSha: deployedSha,
      deploymentId,
      deploymentUrl,
      environment,
      expectedMainSha: mainSha,
      behindMain,
      deploymentSucceeded,
      vercelCheck: vercelCheck?.conclusion ?? null,
      releaseCommitAt: deployedCommitAt,
      releasePr: releasePr
        ? {
            number: releasePr.number,
            title: releasePr.title,
            url: releasePr.html_url,
            headSha: releasePr.head.sha,
          }
        : null,
    },
    agent: infrastructure.agent,
    ci: {
      state: ciState,
      canonicalName: canonicalCheck?.name ?? "Unavailable",
      status: canonicalCheck?.status ?? "unknown",
      conclusion: canonicalCheck?.conclusion ?? null,
      completedAt: canonicalCheck?.completed_at ?? null,
      detailsUrl: canonicalCheck?.details_url ?? null,
      failingChecks,
    },
    migrations: {
      state: migrationState,
      status: migrationStatus,
      requiredForRelease: migrationsRequired,
      releaseMigrationCount: releaseMigrationFiles.length,
      repoCount: repoVersions.length,
      appliedCount: appliedVersions.length,
      pending,
      drift,
      latestRepoVersion: latest(repoVersions),
      latestAppliedVersion: latest(appliedVersions),
      supabaseCheck: supabaseCheck?.conclusion ?? null,
    },
    pullRequests: {
      total: pulls.length,
      ready: pulls.filter((pull) => !pull.draft).length,
      draft: pulls.filter((pull) => pull.draft).length,
      recent: recentPulls,
    },
    failures: {
      state: failureState,
      since: infrastructure.database.data?.since ?? deployedCommitAt,
      countSinceRelease: infrastructure.database.data?.failuresSince ?? null,
      unresolved: infrastructure.database.data?.unresolvedFailures ?? null,
      latestAt: infrastructure.database.data?.latestFailureAt ?? null,
    },
    sources: {
      github: githubState,
      database: infrastructure.database.state,
      agent: infrastructure.agent.state,
    },
  };
}
