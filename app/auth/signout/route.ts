// app/api/auth/signout/route.ts
import { NextResponse, NextRequest } from "next/server";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies: nextCookies });
  await supabase.auth.signOut();

  // send them home (adjust if you want a different landing page)
  return NextResponse.redirect(new URL("/", req.url));
}