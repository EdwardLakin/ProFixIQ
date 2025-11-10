// app/api/chat/my-conversations/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // who is calling
  const supabaseUser = createServerSupabaseRoute();
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminSupabase();

  // 1) convos where I am a participant
  const { data: participantRows, error: cpErr } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (cpErr) {
    console.error("[my-conversations] participants error:", cpErr);
  }

  const participantIds =
    participantRows?.map((r) => r.conversation_id).filter(Boolean) ?? [];

  // 2) convos I created
  const { data: createdRows, error: cErr } = await admin
    .from("conversations")
    .select("id, created_by, context_type, context_id, created_at")
    .eq("created_by", user.id);

  if (cErr) {
    console.error("[my-conversations] created error:", cErr);
  }

  // fetch details for participant convos
  let participantConvos: any[] = [];
  if (participantIds.length) {
    const { data: convos, error: convFetchErr } = await admin
      .from("conversations")
      .select("id, created_by, context_type, context_id, created_at")
      .in("id", participantIds);

    if (!convFetchErr) {
      participantConvos = convos ?? [];
    }
  }

  // merge and dedupe
  const map = new Map<string, any>();
  for (const c of participantConvos) map.set(c.id, c);
  for (const c of createdRows ?? []) map.set(c.id, c);

  const merged = Array.from(map.values()).sort((a, b) => {
    const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bd - ad;
  });

  return NextResponse.json(merged);
}