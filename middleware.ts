// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Role = Database["public"]["Enums"]["user_role_enum"] | null;

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

  let role: Role = null;
  let completed = false;

  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    role = (profile?.role as Role) ?? null;
    completed = Boolean(profile?.completed_onboarding);
  }

  // If hitting the root "/", decide a home:
  if (pathname === "/") {
    if (session?.user) {
      const to = completed ? "/dashboard" : "/onboarding";
      return NextResponse.redirect(new URL(to, req.url));
    }
    return res; // allow landing page for signed-out users
  }

  // Public routes stay public, but keep signed-in users off onboarding if already done
  if (isPublic) {
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    // If a signed-in user opens /sign-in, send them to dashboard
    if (pathname.startsWith("/sign-in") && session?.user) {
      const to = completed ? "/dashboard" : "/onboarding";
      return NextResponse.redirect(new URL(to, req.url));
    }
    return res;
  }

  // Protected branches below: require a session
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding before allowing dashboard (and other protected pages if you like)
  if (pathname.startsWith("/dashboard") && !completed) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Otherwise, allow through
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