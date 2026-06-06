import { NextResponse } from "next/server";

import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

function summarizeError(error: { message?: string; code?: string | null } | null | undefined) {
  if (!error) return null;
  return { message: error.message ?? "Unknown error", code: error.code ?? null };
}

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    console.info("[PartsDashboard] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/dashboard",
    });
    return NextResponse.json({ error: "Unable to resolve shop context." }, { status: 401 });
  }

  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: actor.shopId,
  });

  if (contextError) {
    console.info("[PartsDashboard] set_current_shop_id failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/dashboard",
      code: contextError.code,
      message: contextError.message,
    });
    return NextResponse.json({ error: contextError.message }, { status: 500 });
  }

  const now = new Date();
  const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const [partsRes, movesRes, openReqRes, openPoRes, receiveQueueRes] = await Promise.all([
    supabase
      .from("parts")
      .select("id, created_at, sku, name, part_number, normalized_part_key, import_confidence, source_intake_id")
      .eq("shop_id", actor.shopId),
    supabase
      .from("stock_moves")
      .select("id, part_id, qty_change, reason, created_at, reference_kind, reference_id")
      .eq("shop_id", actor.shopId)
      .gte("created_at", d30Ago.toISOString())
      .order("created_at", { ascending: true }),
    supabase
      .from("part_requests")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("status", ["requested", "quoted", "approved"]),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .in("status", ["draft", "sent", "partially_received"]),
    supabase
      .from("part_request_items")
      .select("qty_approved, qty_received")
      .eq("shop_id", actor.shopId)
      .gt("qty_approved", 0),
  ]);

  const coreError = partsRes.error ?? movesRes.error ?? openReqRes.error ?? openPoRes.error ?? receiveQueueRes.error;
  if (coreError) {
    console.info("[PartsDashboard] load query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/dashboard",
      error: summarizeError(coreError),
    });
    return NextResponse.json({ error: coreError.message }, { status: 500 });
  }

  const stagingRes = await (supabase as any)
    .from("shop_parts_import_staging")
    .select("status")
    .eq("shop_id", actor.shopId);
  const candidateRes = await (supabase as any)
    .from("shop_parts_import_match_candidates")
    .select("staging_id, candidate_part_id");

  if (stagingRes.error || candidateRes.error) {
    console.info("[PartsDashboard] optional import trust query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/dashboard",
      stagingError: summarizeError(stagingRes.error),
      candidateError: summarizeError(candidateRes.error),
    });
  }

  return NextResponse.json({
    shopId: actor.shopId,
    parts: partsRes.data ?? [],
    moves: movesRes.data ?? [],
    openRequestsCount: openReqRes.count ?? 0,
    openPoCount: openPoRes.count ?? 0,
    receiveQueueItems: receiveQueueRes.data ?? [],
    staging: stagingRes.error ? [] : (stagingRes.data ?? []),
    candidates: candidateRes.error ? [] : (candidateRes.data ?? []),
  });
}
