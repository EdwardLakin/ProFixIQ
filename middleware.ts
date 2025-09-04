// middleware.ts
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
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/portal") || // portal stays public, but routed to only for customers
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith(".svg");

  // Public routes
  if (isPublic) {
    // If logged-in user hits the landing page, send to role page
    if (pathname === "/" && session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      const role = profile?.role ?? null;

      const to =
        role === "owner" ? "/dashboard/owner" :
        role === "admin" ? "/dashboard/admin" :
        role === "advisor" ? "/dashboard/advisor" :
        role === "manager" ? "/dashboard/manager" :
        role === "parts" ? "/dashboard/parts" :
        role === "mechanic" || role === "tech" ? "/dashboard/tech" :
        role === "customer" ? "/portal" :
        "/onboarding";

      return NextResponse.redirect(new URL(to, req.url));
    }
    return res;
  }

  // Protected routes below this line
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // If a user with no role hits /dashboard, push them to onboarding
  if (pathname === "/dashboard") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!profile?.role) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};