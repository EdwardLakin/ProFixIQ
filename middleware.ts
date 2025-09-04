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

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.svg";

  // If not logged in and hitting a protected path, send to sign-in
  if (!isPublic && !session?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // If we need role-based decisions, fetch role once
  let role: string | null = null;
  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    role = profile?.role ?? null;
  }

  // Landing page: send logged in users based on role
  if (pathname === "/" && session?.user) {
    if (!role) return NextResponse.redirect(new URL("/onboarding", req.url));
    const staffHome = STAFF_HOME[role];
    return NextResponse.redirect(new URL(staffHome ?? "/portal", req.url));
  }

  // Hard gate: staff never see /portal, customers never see /dashboard/*
  if (session?.user) {
    const isStaff = !!(role && role in STAFF_HOME);
    if (pathname.startsWith("/portal") && isStaff) {
      return NextResponse.redirect(new URL(STAFF_HOME[role!], req.url));
    }
    if (pathname.startsWith("/dashboard")) {
      if (!role) {
        return NextResponse.redirect(new URL("/onboarding", req.url));
      }
      if (!isStaff) {
        // customers can't view dashboards
        return NextResponse.redirect(new URL("/portal", req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};