import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";

export type DeploymentHealthState = "healthy" | "degraded" | "down";

export type DeploymentHealthSnapshot = {
  checkedAt: string;
  overall: DeploymentHealthState;
  production: {
    state: DeploymentHealthState;
    environment: string;
    deployedSha: string | null;
    mainSha: string | null;
    deploymentId: string | null;
    deploymentUrl: string | null;
    matchesMain: boolean | null;
  };
  ci: {
    state: DeploymentHealthState;
    total: number;
    failing: number;
    pending: number;
    skipped: number;
    missingRequired: string[];
    checks: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl: string | null;
    }>;
  };
  migrations: {
    state: DeploymentHealthState;
    repoCount: number | null;
    appliedCount: number | null;
    productionOnly: string[];
    unapplied: string[];
    note: string | null;
  };
  database: {
    state: DeploymentHealthState;
    latencyMs: number | null;
    feedbackRecords: number | null;
    error: string | null;
  };
  pullRequests: {
    total: number;
    ready: number;
    draft: number;
    recent: Array<{
      number: number;
      title: string;
      draft: boolean;
      url: string;
      updatedAt: string;
    }>;
  };
};

type GithubCommit = { sha?: string };
type GithubContentItem = { name?: string; type?: string };
type GithubCheck = {
  name?: string;
  status?: string;
  conclusion?: string | null;
  details_url?: string | null;
};
type GithubChecks = { check_runs?: GithubCheck[] };
type GithubPull = {
  number?: number;
  title?: string;
  draft?: boolean;
  html_url?: string;
  updated_at?: string;
};

const GITHUB_API = "https://api.github.com/repos/EdwardLakin/ProFixIQ";
const DEFAULT_REQUIRED_CI_CHECKS = ["checks"] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredCiCheckNames(): string[] {
  const configured = text(process.env.OPS_REQUIRED_CI_CHECKS);
  if (!configured) return [...DEFAULT_REQUIRED_CI_CHECKS];
  const names = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_REQUIRED_CI_CHECKS, ...names])];
}

async function githubJson<T>(path: string): Promise<T | null> {
  const token =
    text(process.env.OPS_GITHUB_TOKEN) ?? text(process.env.GITHUB_TOKEN);
  try {
    const response = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ProFixIQ-Ops",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 60 },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

function migrationVersion(fileName: string): string | null {
  const match = /^(\d+)_.+\.sql$/.exec(fileName);
  return match ? match[1] : null;
}

async function readProductionMigrationVersions(): Promise<string[] | null> {
  const token = text(process.env.SUPABASE_ACCESS_TOKEN);
  const url = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!token || !url) return null;
  let ref: string | null = null;
  try {
    ref = new URL(url).hostname.split(".")[0] || null;
  } catch {
    ref = null;
  }
  if (!ref) return null;
  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: "select version from supabase_migrations.schema_migrations",
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ version?: unknown }>;
    if (!Array.isArray(rows)) return null;
    return rows.flatMap((row) =>
      typeof row.version === "string" ? [row.version] : [],
    );
  } catch {
    return null;
  }
}

function overallState(states: DeploymentHealthState[]): DeploymentHealthState {
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  return "healthy";
}

function successfulConclusion(value: string | null): boolean {
  return value === "success" || value === "neutral";
}

export async function getOpsDeploymentHealth(): Promise<DeploymentHealthSnapshot> {
  await requireOpsOperatorPageAccess();
  const checkedAt = new Date().toISOString();
  const environment =
    text(process.env.VERCEL_ENV) ?? text(process.env.NODE_ENV) ?? "unknown";
  const deployedSha = text(process.env.VERCEL_GIT_COMMIT_SHA);
  const deploymentId = text(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentUrl = text(process.env.VERCEL_URL);

  const [mainCommit, mainMigrationFiles, appliedVersions, pulls] =
    await Promise.all([
      githubJson<GithubCommit>("/commits/main"),
      githubJson<GithubContentItem[]>("/contents/supabase/migrations?ref=main"),
      readProductionMigrationVersions(),
      githubJson<GithubPull[]>(
        "/pulls?state=open&base=main&per_page=30&sort=updated&direction=desc",
      ),
    ]);
  const mainSha = text(mainCommit?.sha);
  const matchesMain = deployedSha && mainSha ? deployedSha === mainSha : null;

  let checksPayload = deployedSha
    ? await githubJson<GithubChecks>(
        `/commits/${encodeURIComponent(deployedSha)}/check-runs?per_page=100`,
      )
    : null;
  if (
    deployedSha &&
    !checksPayload?.check_runs?.some((check) => check.name === "checks")
  ) {
    // Production is usually a merge commit; bind inherited PR checks to the
    // exact merge commit rather than accepting an arbitrary recent green PR.
    const merged = await githubJson<
      Array<{
        merged_at?: string;
        merge_commit_sha?: string;
        head?: { sha?: string };
      }>
    >(`/commits/${encodeURIComponent(deployedSha)}/pulls?per_page=100`);
    const equivalent = merged?.find(
      (pull) =>
        pull.merged_at &&
        pull.merge_commit_sha === deployedSha &&
        pull.head?.sha,
    );
    if (equivalent?.head?.sha) {
      const headChecks = await githubJson<GithubChecks>(
        `/commits/${encodeURIComponent(equivalent.head.sha)}/check-runs?per_page=100`,
      );
      if (headChecks)
        checksPayload = {
          check_runs: [
            ...(checksPayload?.check_runs ?? []),
            ...(headChecks.check_runs ?? []),
          ],
        };
    }
  }
  const checks = (checksPayload?.check_runs ?? []).map((check) => ({
    name: text(check.name) ?? "Unnamed check",
    status: text(check.status) ?? "unknown",
    conclusion: text(check.conclusion),
    detailsUrl: text(check.details_url),
  }));
  const failing = checks.filter(
    (check) =>
      check.status === "completed" &&
      check.conclusion !== "skipped" &&
      !successfulConclusion(check.conclusion),
  ).length;
  const skipped = checks.filter(
    (check) => check.status === "completed" && check.conclusion === "skipped",
  ).length;
  const pending = checks.filter((check) => check.status !== "completed").length;
  const requiredNames = requiredCiCheckNames();
  const missingRequired = requiredNames.filter(
    (name) =>
      !checks.some(
        (check) =>
          check.name === name &&
          check.status === "completed" &&
          successfulConclusion(check.conclusion),
      ),
  );
  const ciState: DeploymentHealthState =
    !deployedSha || !checksPayload
      ? "degraded"
      : failing > 0
        ? "down"
        : pending > 0 ||
            skipped > 0 ||
            missingRequired.length > 0 ||
            checks.length === 0
          ? "degraded"
          : "healthy";

  const dbStarted = Date.now();
  let databaseRead: { error: { message: string } | null; count: number | null };
  try {
    const admin = createAdminSupabase();
    const readiness = await admin.rpc("feedback_ready");
    if (readiness.error || readiness.data !== true)
      throw new Error("Feedback ledger lockdown is pending");
    databaseRead = await admin
      .from("agent_requests")
      .select("id", { count: "exact", head: true });
  } catch {
    databaseRead = {
      error: { message: "Privileged feedback client is unavailable" },
      count: null,
    };
  }
  const databaseLatency = Date.now() - dbStarted;
  const databaseState: DeploymentHealthState = databaseRead.error
    ? "down"
    : "healthy";

  const repoVersions = mainMigrationFiles
    ? mainMigrationFiles.flatMap((item) => {
        const version =
          item.type === "file" && item.name
            ? migrationVersion(item.name)
            : null;
        return version ? [version] : [];
      })
    : null;
  let migrations: DeploymentHealthSnapshot["migrations"];
  if (!repoVersions || !appliedVersions) {
    migrations = {
      state: "degraded",
      repoCount: repoVersions?.length ?? null,
      appliedCount: appliedVersions?.length ?? null,
      productionOnly: [],
      unapplied: [],
      note: "Migration parity cannot be verified: repository or production ledger evidence is unavailable.",
    };
  } else {
    const applied = new Set(appliedVersions);
    const inRepo = new Set(repoVersions);
    const productionOnly = appliedVersions
      .filter((version) => !inRepo.has(version))
      .sort();
    const unapplied = repoVersions
      .filter((version) => !applied.has(version))
      .sort();
    migrations = {
      state:
        productionOnly.length > 0 || unapplied.length > 0 ? "down" : "healthy",
      repoCount: repoVersions.length,
      appliedCount: appliedVersions.length,
      productionOnly,
      unapplied,
      note:
        productionOnly.length > 0 || unapplied.length > 0
          ? "Migration parity failed: production and main disagree."
          : null,
    };
  }

  const productionState: DeploymentHealthState =
    environment === "production" && !deployedSha
      ? "degraded"
      : matchesMain === false
        ? "degraded"
        : mainSha === null
          ? "degraded"
          : "healthy";

  const normalizedPulls = (pulls ?? []).flatMap((pull) => {
    if (
      typeof pull.number !== "number" ||
      typeof pull.title !== "string" ||
      typeof pull.html_url !== "string"
    )
      return [];
    return [
      {
        number: pull.number,
        title: pull.title,
        draft: pull.draft === true,
        url: pull.html_url,
        updatedAt: text(pull.updated_at) ?? checkedAt,
      },
    ];
  });

  const overall = overallState([productionState, ciState, migrations.state, databaseState]);

  return {
    checkedAt,
    overall,
    production: {
      state: productionState,
      environment,
      deployedSha,
      mainSha,
      deploymentId,
      deploymentUrl,
      matchesMain,
    },
    ci: {
      state: ciState,
      total: checks.length,
      failing,
      pending,
      skipped,
      missingRequired,
      checks,
    },
    migrations,
    database: {
      state: databaseState,
      latencyMs: databaseLatency,
      feedbackRecords: databaseRead.error ? null : (databaseRead.count ?? 0),
      error: databaseRead.error?.message ?? null,
    },
    pullRequests: {
      total: normalizedPulls.length,
      ready: normalizedPulls.filter((pull) => !pull.draft).length,
      draft: normalizedPulls.filter((pull) => pull.draft).length,
      recent: normalizedPulls.slice(0, 8),
    },
  };
}
