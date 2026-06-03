// app/auth/signout/route.ts
import { NextResponse, NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", req.url));
}
