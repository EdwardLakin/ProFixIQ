import { NextResponse } from "next/server";

import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function DELETE(request: Request) {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    return NextResponse.json({ error: "Unable to resolve shop context." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { requestIds?: string[] } | null;
  const requestIds = Array.isArray(body?.requestIds)
    ? body.requestIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (!requestIds.length) return NextResponse.json({ error: "No request ids provided." }, { status: 400 });

  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: actor.shopId,
  });
  if (contextError) return NextResponse.json({ error: contextError.message }, { status: 500 });

  const { data: scopedRequests, error: scopeError } = await supabase
    .from("part_requests")
    .select("id")
    .eq("shop_id", actor.shopId)
    .in("id", requestIds);

  if (scopeError) return NextResponse.json({ error: scopeError.message }, { status: 500 });

  const scopedIds = (scopedRequests ?? []).map((row) => row.id);
  if (!scopedIds.length) return NextResponse.json({ ok: true, deleted: 0 });

  const { error: itemsError } = await supabase
    .from("part_request_items")
    .delete()
    .eq("shop_id", actor.shopId)
    .in("request_id", scopedIds);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const { error: requestsError } = await supabase
    .from("part_requests")
    .delete()
    .eq("shop_id", actor.shopId)
    .in("id", scopedIds);
  if (requestsError) return NextResponse.json({ error: requestsError.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: scopedIds.length });
}
