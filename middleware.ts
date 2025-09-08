// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Strongly typed role from your DB enum
type Role = Database["public"]["Enums"]["user_role_enum"] | null;

export async function middleware(req: NextRequest) {
  // Important: pass the *same* response object to Supabase so it can refresh cookies.
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Normalize auth routes: we will only use /sign-in (not /auth)
  const SIGN_IN_ROUTE = "/sign-in";
  const DASHBOARD_HOME = "/dashboard";

  // Public routes that never require auth
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") || // ← auth page stays public
    pathname.startsWith("/portal") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  // Read role & onboarding when logged in
  let role: Role = null;
  let completed = false;
  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    role = (profile?.role as Role) ?? null;
    completed = !!profile?.completed_onboarding;
  }

  // 1) Signed-in user hits landing → go to dashboard
  if (pathname === "/" && session?.user) {
    return NextResponse.redirect(new URL(DASHBOARD_HOME, req.url));
  }

  // 2) Already signed-in user visiting /sign-in → send to dashboard
  if (pathname.startsWith(SIGN_IN_ROUTE) && session?.user) {
    return NextResponse.redirect(new URL(DASHBOARD_HOME, req.url));
  }

  // 3) Public routes pass through (with one exception below)
  if (isPublic) {
    // If they finished onboarding, keep them off /onboarding
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
      return NextResponse.redirect(new URL(DASHBOARD_HOME, req.url));
    }
    return res;
  }

  // 4) Protected routes (matched by config below)
  // Not logged in → send to sign-in with return URL
  if (!session?.user) {
    const login = new URL(SIGN_IN_ROUTE, req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // 5) Force onboarding only for dashboard branch
  if (pathname.startsWith("/dashboard") && !completed) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Otherwise, allow the request
  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    // add more protected branches here if needed
  ],
};