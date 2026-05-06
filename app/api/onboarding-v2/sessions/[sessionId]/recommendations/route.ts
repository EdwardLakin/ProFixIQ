import { proxyOnboardingAgent } from "@/features/onboarding-v2/server/agentClient";
import { withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });

  const paths = [
    `/onboarding/sessions/${encodeURIComponent(sessionId)}/recommendations`,
    `/onboarding/sessions/${encodeURIComponent(sessionId)}/suggestions`,
  ];

  for (const path of paths) {
    const response = await proxyOnboardingAgent({ method: "GET", path, shopId });
    if (response.status !== 404) {
      const json = (await response.json().catch(() => ({ ok: false, failureKind: "invalid_agent_response", message: "Invalid onboarding agent response." }))) as { items?: unknown[]; raw_data?: unknown };
      delete json.raw_data;
      return Response.json({ ...json, items: Array.isArray(json.items) ? json.items : [] }, { status: response.status });
    }
  }

  return Response.json({ ok: false, failureKind: "not_implemented", items: [], message: "Recommendations endpoint is not available yet." }, { status: 501 });
}
