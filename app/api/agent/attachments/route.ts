// app/api/agent/attachments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        agentRequestId: string;
        storagePath: string;
        publicUrl: string;
        kind?: string;
        caption?: string;
      }
    | null;

  if (!body?.agentRequestId || !body.storagePath || !body.publicUrl) {
    return NextResponse.json(
      { error: "agentRequestId, storagePath, publicUrl required" },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await supabase
    .from("agent_attachments")
    .insert({
      agent_request_id: body.agentRequestId,
      storage_path: body.storagePath,
      public_url: body.publicUrl,
      kind: body.kind ?? "screenshot",
      caption: body.caption,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("agent_attachments insert error", error);
    return NextResponse.json(
      { error: "Failed to register attachment" },
      { status: 500 }
    );
  }

  return NextResponse.json({ attachment: inserted });
}