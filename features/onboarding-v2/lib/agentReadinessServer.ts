import { headers } from "next/headers";
import { defaultAgentReadiness, normalizeAgentReadiness, type AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

export async function getAgentReadinessForDashboard(): Promise<AgentReadiness> {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") ?? "https";

    if (!host) return defaultAgentReadiness();

    const cookie = requestHeaders.get("cookie") ?? "";

    const response = await fetch(`${proto}://${host}/api/onboarding-v2/agent-readiness`, {
      cache: "no-store",
      headers: {
        cookie,
        "x-forwarded-host": host,
        "x-forwarded-proto": proto,
      },
    });

    if (!response.ok) return defaultAgentReadiness();

    return normalizeAgentReadiness(await response.json());
  } catch {
    return defaultAgentReadiness();
  }
}
