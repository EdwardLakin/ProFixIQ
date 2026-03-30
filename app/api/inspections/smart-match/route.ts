import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { findSmartInspectionMatch } from "@/features/inspections/server/findSmartInspectionMatch";

type DB = Database;

type Body = {
  item?: string;
  notes?: string;
  section?: string;
  status?: string;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
  } | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const body = (await req.json().catch(() => null)) as Body | null;

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ match: null }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.shop_id) {
    return NextResponse.json({ match: null });
  }

  const match = await findSmartInspectionMatch({
    supabase,
    shopId: profile.shop_id,
    body: body ?? {},
  });

  return NextResponse.json({ match });
}
