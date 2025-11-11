// app/api/chat/delete-message/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Delete a message if the authenticated user is its sender.
 * Body: { id: string }
 */
export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createServerSupabaseRoute();

  // 1) make sure we're logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2) read message id from body
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const messageId = body?.id;

  if (!messageId) {
    return NextResponse.json({ error: "Message ID required" }, { status: 400 });
  }

  // 3) fetch the message so we can check ownership
  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("id, sender_id")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.sender_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // 4) delete it
  const { error: deleteError } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}