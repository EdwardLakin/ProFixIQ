import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";
import { withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });

  const response = await proxyOnboardingAgent({ method: "GET", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}/materialization-records`, shopId });
  if (response.status === 404) {
    return Response.json({ ok: false, failureKind: "not_implemented", message: "Materialization records endpoint is not available yet." }, { status: 501 });
  }
  const json = (await response.json().catch(() => ({ ok: false, failureKind: "invalid_agent_response", message: "Invalid onboarding agent response." }))) as Record<string, unknown>;
  if ("raw_data" in json) delete json.raw_data;
  return Response.json(json, { status: response.status });
}
