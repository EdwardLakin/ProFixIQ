import "server-only";

import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export type OpsHealthState = "healthy" | "degraded" | "down";

export type OpsHealthService = {
  key: "application" | "database" | "feedback";
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

function applicationHealth(): OpsHealthService {
  const environment = text(process.env.VERCEL_ENV) ?? text(process.env.NODE_ENV) ?? "unknown";
  const commitSha = text(process.env.VERCEL_GIT_COMMIT_SHA);
  const deploymentId = text(process.env.VERCEL_DEPLOYMENT_ID);
  const deploymentUrl = text(process.env.VERCEL_URL);
  const runtimeIdentified = Boolean(commitSha || deploymentId || deploymentUrl);
  const state: OpsHealthState = environment === "production" && !runtimeIdentified ? "degraded" : "healthy";

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

export async function getOpsSystemHealth(): Promise<OpsSystemHealthSnapshot> {
  // Authorization remains user-scoped; only after the owner boundary succeeds do
  // we use the same privileged ledger path as Feedback Control itself.
  const access = await requireOpsOperatorPageAccess();
  const application = applicationHealth();
  const projectRef = projectRefFromUrl(text(process.env.NEXT_PUBLIC_SUPABASE_URL));

  const dbStarted = Date.now();
  const shopRead = await access.supabase
    .from("shops")
    .select("id", { count: "exact", head: true });
  const dbLatency = Date.now() - dbStarted;
  const database: OpsHealthService = shopRead.error
    ? {
        key: "database",
        label: "Supabase production data",
        state: "down",
        summary: `Authenticated database read failed: ${shopRead.error.message}`,
        latencyMs: dbLatency,
        details: [
          { label: "Project", value: projectRef ?? "Unavailable" },
          { label: "Authenticated read", value: "Failed" },
        ],
      }
    : {
        key: "database",
        label: "Supabase production data",
        state: "healthy",
        summary: "Owner-scoped authenticated data access is responding.",
        latencyMs: dbLatency,
        details: [
          { label: "Project", value: projectRef ?? "Unavailable" },
          { label: "Authenticated read", value: "Passed" },
        ],
      };

  const feedbackStarted = Date.now();
  const feedbackRead = await createAdminSupabase()
    .from("agent_requests")
    .select("id", { count: "exact", head: true });
  const feedbackLatency = Date.now() - feedbackStarted;
  const feedback: OpsHealthService = feedbackRead.error
    ? {
        key: "feedback",
        label: "Feedback intake",
        state: "down",
        summary: `Privileged feedback ledger read failed: ${feedbackRead.error.message}`,
        latencyMs: feedbackLatency,
        details: [{ label: "Feedback ledger", value: "Unavailable" }],
      }
    : {
        key: "feedback",
        label: "Feedback intake",
        state: "healthy",
        summary: "The privileged shared feedback ledger is available to Ops.",
        latencyMs: feedbackLatency,
        details: [
          { label: "Feedback records", value: String(feedbackRead.count ?? 0) },
          { label: "Privileged ledger read", value: "Passed" },
          { label: "Autonomous coding", value: "Disabled" },
        ],
      };

  const services = [application, database, feedback];
  const overall: OpsHealthState = services.some((service) => service.state === "down")
    ? "down"
    : services.some((service) => service.state === "degraded")
      ? "degraded"
      : "healthy";

  return {
    checkedAt: new Date().toISOString(),
    overall,
    services,
  };
}
