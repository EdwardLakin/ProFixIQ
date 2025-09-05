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

  const { pathname, search } = req.nextUrl;
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
    pathname.startsWith("/portal") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  // Profile details (role, onboarding)
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

  // Signed-in user opening landing → send to home or onboarding
  if (pathname === "/" && session?.user) {
    const to = role && completed ? STAFF_HOME[role] ?? "/onboarding" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  if (isPublic) {
    // Done with onboarding? Keep them off onboarding pages
    if (pathname.startsWith("/onboarding") && session?.user && role && completed) {
      const to = STAFF_HOME[role] ?? "/dashboard";
      return NextResponse.redirect(new URL(to, req.url));
    }
    return res;
  }

  // Protected routes
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding for dashboard if not complete
  if (pathname.startsWith("/dashboard") && !(role && completed)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

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