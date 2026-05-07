import { withOnboardingAccess } from "@/features/onboarding-v2/server/apiProxy";

export async function GET(_: Request) {
  const access = await withOnboardingAccess();
  if (!access.ok) return access.response;

  // Compatibility route: events are keyed by runId upstream, not sessionId.
  // Return a safe empty list until run-aware polling is available in the UI.
  return Response.json({ items: [] });
}
