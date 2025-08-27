import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname } = req.nextUrl;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||     // Stripe success return + magic link land
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/BlackOpsOne-Regular.ttf") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.svg";

  if (isPublic) {
    // If a logged-in user hits landing, send by role (fallback to /onboarding)
    if (pathname === "/" && session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      const role = profile?.role;
      const to =
        role === "owner"    ? "/dashboard/owner" :
        role === "admin"    ? "/dashboard/admin" :
        role === "advisor"  ? "/dashboard/advisor" :
        role === "manager"  ? "/dashboard/manager" :
        role === "parts"    ? "/dashboard/parts" :
        role === "mechanic" || role === "tech" ? "/dashboard/tech" :
        "/onboarding"; // 👈 default if no role yet

      return NextResponse.redirect(new URL(to, req.url));
    }
    return res;
  }

  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};