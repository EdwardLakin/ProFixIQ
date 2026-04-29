import { NextResponse } from "next/server";
import { activateOnboardingCustomersVehicles } from "@/features/onboarding-agent/server/activateOnboardingCustomersVehicles";
import {
  getCustomerVehicleCheckpoint,
  getCustomerVehicleTotals,
  readOnboardingSessionSummary,
  writeCustomerVehicleCheckpoint,
} from "@/features/onboarding-agent/server/onboardingActivationProgress";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ sessionId: string }> };

type Mode = "start" | "advance" | "status" | "run_until_limit";

function isMode(value: unknown): value is Mode {
  return value === "start" || value === "advance" || value === "status" || value === "run_until_limit";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readMode(request: Request): Promise<Mode> {
  try {
    const body: unknown = await request.json();
    if (isRecord(body) && isMode(body.mode)) return body.mode;
  } catch {
    return "run_until_limit";
  }

  return "run_until_limit";
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id as string;
  const admin = createAdminSupabase();
  const { sessionId } = await context.params;
  const mode = await readMode(request);

  try {
    const totals = await getCustomerVehicleTotals({ supabase: admin, shopId, sessionId });

    if (mode === "status") {
      const summary = await readOnboardingSessionSummary({ supabase: admin, shopId, sessionId });
      return NextResponse.json({
        ok: true,
        mode,
        checkpoint: getCustomerVehicleCheckpoint(summary),
        totals,
      });
    }

    if (mode === "start") {
      const checkpoint = await writeCustomerVehicleCheckpoint({
        supabase: admin,
        shopId,
        sessionId,
        patch: {
          status: "running",
          stage: "initialize",
          startedAt: new Date().toISOString(),
          completedAt: null,
          failedAt: null,
          lastError: null,
          ...totals,
        },
      });

      return NextResponse.json({ ok: true, mode, checkpoint, totals });
    }

    const runningCheckpoint = await writeCustomerVehicleCheckpoint({
      supabase: admin,
      shopId,
      sessionId,
      patch: {
        status: "running",
        stage: "customers",
        failedAt: null,
        lastError: null,
        ...totals,
      },
    });

    const result = await activateOnboardingCustomersVehicles({ supabase: admin, shopId, sessionId });

    const completedCheckpoint = await writeCustomerVehicleCheckpoint({
      supabase: admin,
      shopId,
      sessionId,
      patch: {
        status: "completed",
        stage: "completed",
        completedAt: new Date().toISOString(),
        failedAt: null,
        lastError: null,
        ...totals,
        resultCounters: {
          customersInserted: result.customersInserted,
          customersUpdated: result.customersUpdated,
          customersMatchedExisting: result.customersMatchedExisting,
          vehiclesInserted: result.vehiclesInserted,
          vehiclesUpdated: result.vehiclesUpdated,
          vehiclesMatchedExisting: result.vehiclesMatchedExisting,
          linksMaterialized: result.vehicleCustomerLinksMaterialized,
          linksUnresolved: result.vehicleCustomerLinksUnresolved,
        },
      },
    });

    return NextResponse.json({
      ...result,
      mode,
      totals,
      checkpoint: completedCheckpoint,
      previousCheckpoint: runningCheckpoint,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate customers and vehicles";

    await writeCustomerVehicleCheckpoint({
      supabase: admin,
      shopId,
      sessionId,
      patch: {
        status: "failed",
        stage: "customers",
        failedAt: new Date().toISOString(),
        lastError: message,
      },
    }).catch(() => null);

    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
