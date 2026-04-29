import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ sessionId: string }> };
type Mode = "start" | "advance" | "status" | "run_until_limit";
type Stage = "initialize" | "customers" | "vehicles" | "bridge_writeback" | "links" | "completed";

const CUSTOMER_CHUNK_SIZE = 100;
const VEHICLE_CHUNK_SIZE = 100;
const LINK_CHUNK_SIZE = 250;
const RUN_UNTIL_LIMIT_STEPS = 8;

type Checkpoint = {
  phase: "customers_vehicles";
  status: "idle" | "running" | "completed" | "failed";
  stage: Stage;
  lastCustomerEntityId: string | null;
  lastVehicleEntityId: string | null;
  lastLinkId: string | null;
  customersProcessed: number;
  customersTotal: number;
  vehiclesProcessed: number;
  vehiclesTotal: number;
  linksProcessed: number;
  linksTotal: number;
  processedCount: number;
  totalCount: number;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  lastError: string | null;
} & Record<string, number | string | null>;

function getCheckpoint(summary: any): Checkpoint | null {
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

async function saveCheckpoint(admin: any, shopId: string, sessionId: string, patch: Partial<Checkpoint>) {
  const { data } = await admin.from("onboarding_sessions").select("summary").eq("shop_id", shopId).eq("id", sessionId).maybeSingle();
  const summary = data?.summary && typeof data.summary === "object" ? { ...data.summary } : {};
  const current = getCheckpoint(summary);
  const merged: Checkpoint = {
    phase: "customers_vehicles",
    status: "idle",
    stage: "initialize",
    lastCustomerEntityId: null,
    lastVehicleEntityId: null,
    lastLinkId: null,
    customersProcessed: 0,
    customersTotal: 0,
    vehiclesProcessed: 0,
    vehiclesTotal: 0,
    linksProcessed: 0,
    linksTotal: 0,
    processedCount: 0,
    totalCount: 0,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    lastError: null,
    customersInserted: 0,
    customersUpdated: 0,
    customersMatchedExisting: 0,
    customersSkippedDuplicateStaged: 0,
    customersSkippedAmbiguous: 0,
    customersRecoveredFromUniqueConflict: 0,
    customersSkipped: 0,
    vehiclesInserted: 0,
    vehiclesUpdated: 0,
    vehiclesMatchedExisting: 0,
    vehiclesSkipped: 0,
    vehicleCustomerLinksCreated: 0,
    vehicleCustomerLinksUpdated: 0,
    vehicleCustomerLinksAlreadyCorrect: 0,
    vehicleCustomerLinksSkipped: 0,
    vehicleCustomerLinksMaterialized: 0,
    vehicleCustomerLinksUnresolved: 0,
    ...(current ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  (summary as any).onboardingActivation = (summary as any).onboardingActivation ?? {};
  (summary as any).onboardingActivation.customersVehicles = merged;
  await admin.from("onboarding_sessions").update({ summary }).eq("shop_id", shopId).eq("id", sessionId);
  return merged;
}

async function processChunk(admin: any, shopId: string, sessionId: string, checkpoint: Checkpoint): Promise<Checkpoint> {
  if (checkpoint.stage === "initialize") {
    return saveCheckpoint(admin, shopId, sessionId, { status: "running", stage: "customers" });
  }
  if (checkpoint.stage === "customers") {
    const query = admin.from("onboarding_entities").select("id").eq("shop_id", shopId).eq("session_id", sessionId).eq("entity_type", "customer").in("status", ["ready", "matched", "activated"]).order("id", { ascending: true }).limit(CUSTOMER_CHUNK_SIZE);
    const { data } = checkpoint.lastCustomerEntityId ? await query.gt("id", checkpoint.lastCustomerEntityId) : await query;
    const rows = data ?? [];
    if (rows.length === 0) return saveCheckpoint(admin, shopId, sessionId, { stage: "vehicles" });
    return saveCheckpoint(admin, shopId, sessionId, {
      lastCustomerEntityId: rows[rows.length - 1].id,
      customersProcessed: checkpoint.customersProcessed + rows.length,
      processedCount: checkpoint.processedCount + rows.length,
      customersSkipped: Number(checkpoint.customersSkipped ?? 0) + rows.length,
    });
  }
  if (checkpoint.stage === "vehicles") {
    const query = admin.from("onboarding_entities").select("id").eq("shop_id", shopId).eq("session_id", sessionId).eq("entity_type", "vehicle").in("status", ["ready", "matched", "activated"]).order("id", { ascending: true }).limit(VEHICLE_CHUNK_SIZE);
    const { data } = checkpoint.lastVehicleEntityId ? await query.gt("id", checkpoint.lastVehicleEntityId) : await query;
    const rows = data ?? [];
    if (rows.length === 0) return saveCheckpoint(admin, shopId, sessionId, { stage: "bridge_writeback" });
    return saveCheckpoint(admin, shopId, sessionId, {
      lastVehicleEntityId: rows[rows.length - 1].id,
      vehiclesProcessed: checkpoint.vehiclesProcessed + rows.length,
      processedCount: checkpoint.processedCount + rows.length,
      vehiclesSkipped: Number(checkpoint.vehiclesSkipped ?? 0) + rows.length,
    });
  }
  if (checkpoint.stage === "bridge_writeback") {
    return saveCheckpoint(admin, shopId, sessionId, { stage: "links" });
  }
  if (checkpoint.stage === "links") {
    const query = admin.from("onboarding_entity_links").select("id").eq("shop_id", shopId).eq("session_id", sessionId).eq("link_type", "customer_vehicle").order("id", { ascending: true }).limit(LINK_CHUNK_SIZE);
    const { data } = checkpoint.lastLinkId ? await query.gt("id", checkpoint.lastLinkId) : await query;
    const rows = data ?? [];
    if (rows.length === 0) {
      return saveCheckpoint(admin, shopId, sessionId, { stage: "completed", status: "completed", completedAt: new Date().toISOString() });
    }
    return saveCheckpoint(admin, shopId, sessionId, {
      lastLinkId: rows[rows.length - 1].id,
      linksProcessed: checkpoint.linksProcessed + rows.length,
      processedCount: checkpoint.processedCount + rows.length,
      vehicleCustomerLinksSkipped: Number(checkpoint.vehicleCustomerLinksSkipped ?? 0) + rows.length,
    });
  }
  return checkpoint;
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id as string;
  const admin = createAdminSupabase();
  const { sessionId } = await context.params;
  let mode: Mode = "run_until_limit";
  try { const body = await request.json(); if (body?.mode) mode = body.mode; } catch {}

  try {
    const totals = await getTotals(admin, shopId, sessionId);
    const { data: session } = await admin.from("onboarding_sessions").select("summary").eq("shop_id", shopId).eq("id", sessionId).maybeSingle();
    let checkpoint = getCheckpoint(session?.summary);

    if (mode === "status") return NextResponse.json({ ok: true, mode, checkpoint, totals });
    if (mode === "start" || !checkpoint) {
      checkpoint = await saveCheckpoint(admin, shopId, sessionId, { status: "running", stage: "initialize", startedAt: new Date().toISOString(), ...totals, totalCount: totals.customersTotal + totals.vehiclesTotal + totals.linksTotal });
      if (mode === "start") return NextResponse.json({ ok: true, mode, checkpoint, totals });
    }

    if (mode === "advance") {
      checkpoint = await processChunk(admin, shopId, sessionId, checkpoint);
      return NextResponse.json({ ok: true, mode, checkpoint, totals });
    }

    for (let i = 0; i < RUN_UNTIL_LIMIT_STEPS; i += 1) {
      if (checkpoint.stage === "completed" || checkpoint.status === "failed") break;
      checkpoint = await processChunk(admin, shopId, sessionId, checkpoint);
    }
    return NextResponse.json({ ok: true, mode, checkpoint, totals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to activate customers and vehicles";
    const failed = await saveCheckpoint(admin, shopId, sessionId, { status: "failed", failedAt: new Date().toISOString(), lastError: message });
    return NextResponse.json({ ok: false, error: message, checkpoint: failed }, { status: 500 });
  }
}
