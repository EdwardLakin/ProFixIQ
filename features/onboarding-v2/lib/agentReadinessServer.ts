import { cookies } from "next/headers";
import { defaultAgentReadiness, normalizeAgentReadiness, type AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

export async function getAgentReadinessForDashboard(): Promise<AgentReadiness> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const response = await fetch("/api/onboarding-v2/agent-readiness", {
      cache: "no-store",
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    });

    if (!response.ok) return defaultAgentReadiness();
    return normalizeAgentReadiness(await response.json());
  } catch {
    return defaultAgentReadiness();
  }
}
