import { NextResponse } from "next/server";
import { activateOnboardingCustomersVehicles } from "@/features/onboarding-agent/server/activateOnboardingCustomersVehicles";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ sessionId: string }> };

type Mode = "start" | "advance" | "status" | "run_until_limit";

const SAFE_TOTAL_LIMIT = 500;

function getCheckpoint(summary: any) {
  return summary?.onboardingActivation?.customersVehicles ?? null;
}

async function getTotals(admin: any, shopId: string, sessionId: string) {
  const [c, v, l] = await Promise.all([
    admin.from("onboarding_entities").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("session_id", sessionId).eq("entity_type", "customer").in("status", ["ready", "matched", "activated"]),
    admin.from("onboarding_entities").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("session_id", sessionId).eq("entity_type", "vehicle").in("status", ["ready", "matched", "activated"]),
    admin.from("onboarding_entity_links").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("session_id", sessionId).eq("link_type", "customer_vehicle"),
  ]);
  return { customersTotal: Number(c.count ?? 0), vehiclesTotal: Number(v.count ?? 0), linksTotal: Number(l.count ?? 0) };
}

async function writeCheckpoint(admin: any, shopId: string, sessionId: string, patch: Record<string, unknown>) {
  const { data } = await admin.from("onboarding_sessions").select("summary").eq("shop_id", shopId).eq("id", sessionId).maybeSingle();
  const summary = data?.summary && typeof data.summary === "object" ? { ...data.summary } : {};
  const existing = getCheckpoint(summary) ?? {};
  (summary as any).onboardingActivation = (summary as any).onboardingActivation ?? {};
  (summary as any).onboardingActivation.customersVehicles = { ...existing, ...patch, phase: "customers_vehicles", updatedAt: new Date().toISOString() };
  await admin.from("onboarding_sessions").update({ summary }).eq("shop_id", shopId).eq("id", sessionId);
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id as string;
  const admin = createAdminSupabase();
  const { sessionId } = await context.params;

  let mode: Mode = "run_until_limit";
  try {
    const body = await request.json();
    if (body?.mode) mode = body.mode;
  } catch {}

  try {
    const { data: session } = await admin.from("onboarding_sessions").select("summary").eq("shop_id", shopId).eq("id", sessionId).maybeSingle();
    const checkpoint = getCheckpoint(session?.summary);
    const totals = await getTotals(admin, shopId, sessionId);

    if (mode === "status") return NextResponse.json({ ok: true, mode, checkpoint, totals });

    if (mode === "start") {
      await writeCheckpoint(admin, shopId, sessionId, {
        status: "running",
        stage: "initialize",
        startedAt: new Date().toISOString(),
        failedAt: null,
        completedAt: null,
        lastError: null,
        ...totals,
      });
      return NextResponse.json({ ok: true, mode, checkpoint: { status: "running", stage: "initialize", ...totals } });
    }

    const totalCount = totals.customersTotal + totals.vehiclesTotal + totals.linksTotal;
    if (totalCount > SAFE_TOTAL_LIMIT) {
      await writeCheckpoint(admin, shopId, sessionId, {
        status: "running",
        stage: "customers",
        lastError: `Session too large for single-request activation (${totalCount}). Use chunked advance flow.`,
        ...totals,
      });
      return NextResponse.json({ ok: false, error: "session_too_large_for_unbounded_activation", mode, totals, checkpoint: getCheckpoint((await admin.from("onboarding_sessions").select("summary").eq("shop_id", shopId).eq("id", sessionId).maybeSingle()).data?.summary) }, { status: 409 });
    }

    const result = await activateOnboardingCustomersVehicles({ supabase: admin, shopId, sessionId });
    await writeCheckpoint(admin, shopId, sessionId, {
      status: "completed",
      stage: "completed",
      completedAt: new Date().toISOString(),
      totals,
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
    });
    return NextResponse.json({ ...result, mode, totals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate customers and vehicles";
    await writeCheckpoint(admin, shopId, sessionId, {
      status: "failed",
      stage: "customers",
      failedAt: new Date().toISOString(),
      lastError: message,
    });
    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
