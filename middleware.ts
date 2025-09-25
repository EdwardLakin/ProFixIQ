// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;
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
    pathname.startsWith("/portal") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  let role: UserRole | null = null;
  let completed = false;

  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    role = profile?.role ?? null;
    completed = !!profile?.completed_onboarding;
  }

  // Signed-in user hitting landing → go to dashboard or onboarding
  if (pathname === "/" && session?.user) {
    const to = role && completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  if (isPublic) {
    // ✅ If you’re already signed in, keep you off the auth pages
    if ((pathname.startsWith("/sign-in") || pathname.startsWith("/signup")) && session?.user) {
      const to = role && completed ? "/dashboard" : "/onboarding";
      return NextResponse.redirect(new URL(to, req.url));
    }

    // Finished onboarding? keep you off /onboarding
    if (pathname.startsWith("/onboarding") && session?.user && role && completed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return res;
  }

  // Protected branches
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding inside dashboard if not complete
  if (pathname.startsWith("/dashboard") && !(role && completed)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/work-orders/:path*", "/inspections/:path*"],
};