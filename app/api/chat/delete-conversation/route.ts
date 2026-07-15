// app/api/chat/delete-conversation/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import { authorizeConversationLifecycleAction } from "@/features/ai/lib/chat/authorization";

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

  const access = await authorizeConversationLifecycleAction({
    supabase: admin,
    conversationId: id,
    actorUserId: user.id,
    action: "delete",
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error: delErr } = await admin
    .from("conversations")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
