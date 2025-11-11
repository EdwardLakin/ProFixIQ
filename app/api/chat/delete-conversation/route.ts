import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createServerSupabaseRoute();

  // 1) require auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2) read body
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) {
    return NextResponse.json(
      { error: "Conversation ID required" },
      { status: 400 },
    );
  }

  // 3) verify ownership (only creator can delete)
  const { data: convo, error } = await supabase
    .from("conversations")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!convo) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }
  if (convo.created_by !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 4) delete related rows first (messages, participants)
  await supabase.from("messages").delete().eq("conversation_id", id);
  await supabase.from("conversation_participants").delete().eq("conversation_id", id);

  // 5) delete the conversation
  const { error: delErr } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}