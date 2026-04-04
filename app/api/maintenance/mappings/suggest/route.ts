import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { suggestMaintenanceMenuMatch } from "@/features/maintenance/server/suggestMaintenanceMenuMatch";

type DB = Database;

type RequestBody = {
  serviceCode?: string;
  label?: string;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Unable to resolve shop context" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const serviceCode = body?.serviceCode?.trim();
  const label = body?.label?.trim();

  if (!serviceCode || !label) {
    return NextResponse.json({ error: "serviceCode and label are required" }, { status: 400 });
  }

  try {
    const suggestion = await suggestMaintenanceMenuMatch({
      supabase,
      shopId: profile.shop_id as string,
      serviceCode,
      label,
    });

    return NextResponse.json({ ok: true, suggestion });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to suggest maintenance mapping";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
