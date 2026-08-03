import {
  createDashboardServerClient,
  getDashboardIdentity,
} from "@/features/dashboard/server/dashboard-shell-data";
import { buildOwnerIntelligenceReport } from "@/features/owner/reports/server/buildOwnerIntelligenceReport";
import type { OwnerIntelligenceReport } from "@/features/owner/reports/ownerIntelligenceTypes";

export type PerformanceDashboardPayload = {
  identity: Awaited<ReturnType<typeof getDashboardIdentity>>;
  report: OwnerIntelligenceReport | null;
  sectionErrors: string[];
};

export async function getPerformanceDashboardPayload(): Promise<PerformanceDashboardPayload> {
  const supabase = createDashboardServerClient();
  const identity = await getDashboardIdentity(supabase);
  const payload: PerformanceDashboardPayload = {
    identity,
    report: null,
    sectionErrors: [],
  };

  if (!identity.shopId) {
    payload.sectionErrors.push("No shop context found for this user.");
    return payload;
  }

  try {
    payload.report = await buildOwnerIntelligenceReport({
      supabase,
      shopId: identity.shopId,
      range: "monthly",
    });
  } catch (error: unknown) {
    payload.sectionErrors.push(
      error instanceof Error
        ? error.message
        : "Owner intelligence could not be loaded.",
    );
  }

  return payload;
}
