import { proxyJson, withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });
  const query = new URL(request.url).searchParams;
  return proxyJson({ method: "GET", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}/events`, shopId, query });
}
