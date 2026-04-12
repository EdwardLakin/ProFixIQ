import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminSupabase, createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    participant_ids?: string[];
    context_type?: string | null;
    context_id?: string | null;
    title?: string | null;
    is_broadcast?: boolean;
  } | null;

  const participantIds = Array.from(new Set(body?.participant_ids ?? [])).filter(Boolean);
  if (participantIds.length === 0) {
    return NextResponse.json({ error: "participant_ids required" }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: me } = await admin.from("profiles").select("id, role, shop_id").eq("id", user.id).maybeSingle();
  if (!me?.shop_id) return NextResponse.json({ error: "No shop profile" }, { status: 403 });

  if (body?.is_broadcast && !["owner", "manager", "admin"].includes(me.role ?? "")) {
    return NextResponse.json({ error: "Only owner/manager/admin can broadcast" }, { status: 403 });
  }

  const { data: recipients } = await admin
    .from("profiles")
    .select("id")
    .in("id", participantIds)
    .eq("shop_id", me.shop_id);

  const safeRecipientIds = (recipients ?? []).map((r) => r.id).filter((id) => id !== user.id);
  if (safeRecipientIds.length === 0) {
    return NextResponse.json({ error: "No valid in-shop recipients found" }, { status: 400 });
  }

  const conversationId = randomUUID();
  const { error: convoErr } = await admin.from("conversations").insert({
    id: conversationId,
    created_by: user.id,
    context_type: body?.context_type ?? null,
    context_id: body?.context_id ?? null,
    title: body?.title ?? null,
    is_group: safeRecipientIds.length > 1 || !!body?.is_broadcast,
  });

  if (convoErr) return NextResponse.json({ error: convoErr.message }, { status: 500 });

  const participants = [user.id, ...safeRecipientIds].map((id) => ({ id: randomUUID(), conversation_id: conversationId, user_id: id }));
  const { error: partErr } = await admin.from("conversation_participants").insert(participants);
  if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

  return NextResponse.json({ id: conversationId }, { status: 200 });
}
