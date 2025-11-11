// app/api/chat/delete-conversation/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = (await req.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // make sure the convo exists and user is allowed
  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (convoErr) {
    return NextResponse.json({ error: convoErr.message }, { status: 500 });
  }
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // only creator can delete, adjust if you want participants too
  if (convo.created_by !== user.id) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // delete messages first (FKs)
  const { error: msgErr } = await admin
    .from("messages")
    .delete()
    .eq("conversation_id", id);

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // delete participants
  const { error: partErr } = await admin
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", id);

  if (partErr) {
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }

  // delete conversation
  const { error: delErr } = await admin
    .from("conversations")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}