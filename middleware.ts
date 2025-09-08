// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Role = Database["public"]["Enums"]["user_role_enum"];

const STAFF_HOME: Record<Exclude<Role, "customer"> | "tech", string> = {
  owner: "/dashboard/owner",
  admin: "/dashboard/admin",
  manager: "/dashboard/manager",
  advisor: "/dashboard/advisor",
  parts: "/dashboard/parts",
  mechanic: "/dashboard/tech",
  tech: "/dashboard/tech", // alias
};

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

  // Session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Profile bits used for routing
  let role: Role | null = null;
  let completed = false;

  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    role = (profile?.role as Role | null) ?? null;
    completed = Boolean(profile?.completed_onboarding);
  }

  // If a signed-in user hits the landing page, send them somewhere useful
  if (pathname === "/" && session?.user) {
    const to =
      role && completed
        ? STAFF_HOME[(role as Exclude<Role, "customer">)] ?? "/dashboard"
        : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // Public branch: also keep users off onboarding once completed
  if (isPublic) {
    if (pathname.startsWith("/onboarding") && session?.user && role && completed) {
      const to =
        STAFF_HOME[(role as Exclude<Role, "customer">)] ?? "/dashboard";
      return NextResponse.redirect(new URL(to, req.url));
    }
    return res;
  }

  // Protected branches below here -------------------------------

  // Not signed in → send to sign-in with redirect back
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding completion for any /dashboard* page
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
    // add more protected branches here if needed
  ],
};