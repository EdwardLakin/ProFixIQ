import { proxyJson, withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

export async function POST(_: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;
  const { sessionId } = await context.params;
  const shopId = access.profile.shop_id;
  if (!shopId) return Response.json({ error: "Missing shop context" }, { status: 403 });
  return proxyJson({ method: "POST", path: `/onboarding/sessions/${encodeURIComponent(sessionId)}/confirm`, shopId });
}
