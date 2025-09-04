// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const STAFF_HOME: Record<string, string> = {
  owner: "/dashboard/owner",
  admin: "/dashboard/admin",
  manager: "/dashboard/manager",
  advisor: "/dashboard/advisor",
  parts: "/dashboard/parts",
  mechanic: "/dashboard/tech",
  tech: "/dashboard/tech",
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname } = req.nextUrl;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public pages
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/portal") || // customer portal always public
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  // If we need role/completion info, fetch it once
  let role: string | null = null;
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

  // Logged-in user hits the landing? Send to their home (or onboarding if not done)
  if (pathname === "/" && session?.user) {
    const to = role && completed ? STAFF_HOME[role] ?? "/onboarding" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  if (isPublic) {
    // If user tries to open /onboarding but they’re done, send to their home
    if (pathname.startsWith("/onboarding") && session?.user && role && completed) {
      const to = STAFF_HOME[role] ?? "/dashboard";
      return NextResponse.redirect(new URL(to, req.url));
    }
    return res;
  }

  // Protected routes below
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // If user hasn’t completed onboarding, force them there from any /dashboard* page
  if (pathname.startsWith("/dashboard") && !(role && completed)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};