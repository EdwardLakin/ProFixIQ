import { proxyJson, withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });
  const source = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  ["linkType", "status", "limit", "offset"].forEach((key) => { const v = source.get(key); if (v) query.set(key, v); });
  return proxyJson({ method: "GET", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}/links`, shopId, query });
}
