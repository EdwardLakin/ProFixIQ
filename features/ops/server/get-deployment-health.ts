import "server-only";

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
    checks: Array<{
      name: string;
      status: string;
      conclusion: string | null;
      detailsUrl: string | null;
    }>;
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

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function githubJson<T>(path: string): Promise<T | null> {
  const token = text(process.env.OPS_GITHUB_TOKEN) ?? text(process.env.GITHUB_TOKEN);
  try {
    const response = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ProFixIQ-Ops",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 60 },
    });
    return response.ok ? (await response.json()) as T : null;
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
  return value === "success" || value === "neutral" || value === "skipped";
}

export async function getOpsDeploymentHealth(): Promise<DeploymentHealthSnapshot> {
  const access = await requireOpsOperatorPageAccess();
  const checkedAt = new Date().toISOString();
  const environment = text(process.env.VERCEL_ENV) ?? text(process.env.NODE_ENV) ?? "unknown";
  const deployedSha = text(process.env.VERCEL_GIT_COMMIT_SHA);
  const deploymentId = text(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentUrl = text(process.env.VERCEL_URL);

  const [mainCommit, pulls] = await Promise.all([
    githubJson<GithubCommit>("/commits/main"),
    githubJson<GithubPull[]>("/pulls?state=open&base=main&per_page=30&sort=updated&direction=desc"),
  ]);
  const mainSha = text(mainCommit?.sha);
  const matchesMain = deployedSha && mainSha ? deployedSha === mainSha : null;

  const checksPayload = deployedSha
    ? await githubJson<GithubChecks>(`/commits/${encodeURIComponent(deployedSha)}/check-runs?per_page=100`)
    : null;
  const checks = (checksPayload?.check_runs ?? []).map((check) => ({
    name: text(check.name) ?? "Unnamed check",
    status: text(check.status) ?? "unknown",
    conclusion: text(check.conclusion),
    detailsUrl: text(check.details_url),
  }));
  const failing = checks.filter((check) => check.status === "completed" && !successfulConclusion(check.conclusion)).length;
  const pending = checks.filter((check) => check.status !== "completed").length;
  const ciState: DeploymentHealthState = !deployedSha || !checksPayload
    ? "degraded"
    : failing > 0
      ? "down"
      : pending > 0 || checks.length === 0
        ? "degraded"
        : "healthy";

  const dbStarted = Date.now();
  const databaseRead = await access.supabase
    .from("agent_requests")
    .select("id", { count: "exact", head: true });
  const databaseLatency = Date.now() - dbStarted;
  const databaseState: DeploymentHealthState = databaseRead.error ? "down" : "healthy";

  const productionState: DeploymentHealthState = environment === "production" && !deployedSha
    ? "degraded"
    : matchesMain === false
      ? "degraded"
      : mainSha === null
        ? "degraded"
        : "healthy";

  const normalizedPulls = (pulls ?? []).flatMap((pull) => {
    if (typeof pull.number !== "number" || typeof pull.title !== "string" || typeof pull.html_url !== "string") return [];
    return [{
      number: pull.number,
      title: pull.title,
      draft: pull.draft === true,
      url: pull.html_url,
      updatedAt: text(pull.updated_at) ?? checkedAt,
    }];
  });

  return {
    checkedAt,
    overall: overallState([productionState, ciState, databaseState]),
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
      checks,
    },
    database: {
      state: databaseState,
      latencyMs: databaseRead.error ? databaseLatency : databaseLatency,
      feedbackRecords: databaseRead.error ? null : databaseRead.count ?? 0,
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
