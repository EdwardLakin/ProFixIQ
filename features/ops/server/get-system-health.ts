import "server-only";

import {
  AgentTeamRequestError,
  readAgentTeamReadiness,
} from "@/features/agent/server/teamClient";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";

export type OpsHealthState = "healthy" | "degraded" | "down";

export type OpsRuntimeGeneration = {
  schemaVersion?: number | null;
  commitSha: string | null;
  deploymentId: string | null;
  deploymentUrl: string | null;
  explicitGeneration: string | null;
  fingerprint: string | null;
  verifiable: boolean;
};

export type OpsHealthService = {
  key: "application" | "database" | "agent";
  label: string;
  state: OpsHealthState;
  summary: string;
  latencyMs: number | null;
  details: Array<{ label: string; value: string }>;
};

export type OpsSystemHealthSnapshot = {
  checkedAt: string;
  overall: OpsHealthState;
  services: OpsHealthService[];
};

function text(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : "Unavailable";
}

function projectRefFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function currentApplicationHealth(): OpsHealthService {
  const environment = text(process.env.VERCEL_ENV) ?? text(process.env.NODE_ENV) ?? "unknown";
  const commitSha = text(process.env.VERCEL_GIT_COMMIT_SHA);
  const deploymentId = text(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentUrl = text(process.env.VERCEL_URL);
  const runtimeIdentified = Boolean(commitSha || deploymentId || deploymentUrl);
  const production = environment === "production";
  const state: OpsHealthState = production && !runtimeIdentified ? "degraded" : "healthy";

  return {
    key: "application",
    label: "ProFixIQ application",
    state,
    summary: state === "healthy"
      ? "The Ops server route is executing normally."
      : "The application is responding, but production deployment identity is unavailable.",
    latencyMs: null,
    details: [
      { label: "Environment", value: environment },
      { label: "Commit", value: shortSha(commitSha) },
      { label: "Deployment", value: deploymentId ?? "Unavailable" },
      { label: "Runtime URL", value: deploymentUrl ?? "Unavailable" },
    ],
  };
}

function normalizeAgentRuntime(value: unknown): OpsRuntimeGeneration | null {
  if (!isRecord(value)) return null;
  const fingerprint = text(value.fingerprint);
  return {
    schemaVersion: Number.isFinite(Number(value.schemaVersion)) ? Number(value.schemaVersion) : null,
    commitSha: text(value.commitSha),
    deploymentId: text(value.deploymentId),
    deploymentUrl: text(value.deploymentUrl),
    explicitGeneration: text(value.explicitGeneration),
    fingerprint,
    verifiable: value.verifiable === true && Boolean(fingerprint),
  };
}

function agentDetails(
  responseStatus: number,
  runtime: OpsRuntimeGeneration | null,
  generationVerifiable: boolean,
  pipelineReady: boolean,
): Array<{ label: string; value: string }> {
  return [
    { label: "HTTP", value: String(responseStatus) },
    { label: "Generation", value: generationVerifiable ? "Verified" : "Unverified" },
    { label: "Pipeline readiness", value: pipelineReady ? "Passed" : "Failed" },
    { label: "Commit", value: shortSha(runtime?.commitSha ?? null) },
    { label: "Deployment", value: runtime?.deploymentId ?? "Unavailable" },
    { label: "Fingerprint", value: runtime?.fingerprint ? runtime.fingerprint.slice(0, 16) : "Unavailable" },
  ];
}

async function agentHealth(): Promise<OpsHealthService> {
  const baseUrl = text(process.env.PROFIXIQ_AGENT_URL)?.replace(/\/+$/, "") ?? null;
  if (!baseUrl) {
    return {
      key: "agent",
      label: "ProFixIQ Agent",
      state: "down",
      summary: "PROFIXIQ_AGENT_URL is not configured for this environment.",
      latencyMs: null,
      details: [{ label: "Endpoint", value: "Not configured" }],
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const [response, readiness] = await Promise.all([
      fetch(`${baseUrl}/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "application/json" },
      }),
      readAgentTeamReadiness(controller.signal)
        .then((payload) => ({ ok: payload.ok === true, error: null as string | null }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof AgentTeamRequestError
            ? error.status === 403
              ? "Authenticated Agent API access was denied."
              : "A required Agent pipeline dependency is unavailable."
            : "Authenticated Agent pipeline readiness is unreachable.",
        })),
    ]);
    const latencyMs = Date.now() - started;
    const raw = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      payload = isRecord(parsed) ? parsed : null;
    } catch {
      payload = null;
    }

    const runtime = normalizeAgentRuntime(payload?.runtime);
    const serviceStatus = text(payload?.status);
    const generationVerifiable = runtime?.verifiable === true;
    const details = agentDetails(
      response.status,
      runtime,
      generationVerifiable,
      readiness.ok,
    );

    if (response.ok && serviceStatus === "ok" && generationVerifiable && readiness.ok) {
      return {
        key: "agent",
        label: "ProFixIQ Agent",
        state: "healthy",
        summary: "Agent worker, protected API, dependencies, and deployment generation are verifiable.",
        latencyMs,
        details,
      };
    }

    if (!payload) {
      return {
        key: "agent",
        label: "ProFixIQ Agent",
        state: "down",
        summary: `Agent health returned HTTP ${response.status} without a valid health payload.`,
        latencyMs,
        details,
      };
    }

    return {
      key: "agent",
      label: "ProFixIQ Agent",
      state: "degraded",
      summary: readiness.error
        ?? (!generationVerifiable
        ? "Agent is reachable, but its deployment generation is not yet verifiable."
        : text(payload.error) ?? `Agent health returned HTTP ${response.status}.`),
      latencyMs,
      details,
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message = error instanceof Error && error.name === "AbortError"
      ? "Agent health request timed out."
      : "Agent health endpoint is unreachable.";
    return {
      key: "agent",
      label: "ProFixIQ Agent",
      state: "down",
      summary: message,
      latencyMs,
      details: [{ label: "Endpoint", value: baseUrl }],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function databaseHealth(): Promise<OpsHealthService> {
  const access = await requireOpsOperatorPageAccess();
  const started = Date.now();
  const result = await access.supabase
    .from("agent_requests")
    .select("id", { count: "exact", head: true });
  const latencyMs = Date.now() - started;
  const projectRef = projectRefFromUrl(text(process.env.NEXT_PUBLIC_SUPABASE_URL));

  if (result.error) {
    return {
      key: "database",
      label: "Supabase production data",
      state: "down",
      summary: `Authenticated database read failed: ${result.error.message}`,
      latencyMs,
      details: [
        { label: "Project", value: projectRef ?? "Unavailable" },
        { label: "Authenticated read", value: "Failed" },
      ],
    };
  }

  return {
    key: "database",
    label: "Supabase production data",
    state: "healthy",
    summary: "Owner-scoped authenticated data access is responding.",
    latencyMs,
    details: [
      { label: "Project", value: projectRef ?? "Unavailable" },
      { label: "Agent requests", value: String(result.count ?? 0) },
      { label: "Authenticated read", value: "Passed" },
    ],
  };
}

function overallState(services: OpsHealthService[]): OpsHealthState {
  if (services.some((service) => service.state === "down")) return "down";
  if (services.some((service) => service.state === "degraded")) return "degraded";
  return "healthy";
}

export async function getOpsSystemHealth(): Promise<OpsSystemHealthSnapshot> {
  const checkedAt = new Date().toISOString();
  const application = currentApplicationHealth();
  const [database, agent] = await Promise.all([
    databaseHealth(),
    agentHealth(),
  ]);
  const services = [application, database, agent];

  return {
    checkedAt,
    overall: overallState(services),
    services,
  };
}
