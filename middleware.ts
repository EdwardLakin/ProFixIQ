// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  // Public routes that never require auth
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Only fetch what we use: onboarding
  let completed = false;
  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();
    completed = Boolean(profile?.completed_onboarding);
  }

  // Root route → send signed-in users to dashboard/onboarding
  if (pathname === "/") {
    if (session?.user) {
      return NextResponse.redirect(
        new URL(completed ? "/dashboard" : "/onboarding", req.url),
      );
    }
    return res;
  }

  // Public routes stay public
  if (isPublic) {
    // Keep completed users off onboarding
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // Signed-in user opening /sign-in → go to home
    if (pathname.startsWith("/sign-in") && session?.user) {
      return NextResponse.redirect(
        new URL(completed ? "/dashboard" : "/onboarding", req.url),
      );
    }
    return res;
  }

  // Protected branches below require a session
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding before allowing dashboard (and any other protected pages you prefer)
  if (pathname.startsWith("/dashboard") && !completed) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/",
    "/onboarding/:path*",
    "/sign-in",
  ],
};