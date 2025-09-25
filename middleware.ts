// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

function isAssetPath(p: string) {
  return (
    p.startsWith("/_next") ||
    p.startsWith("/fonts") ||
    p.endsWith("/favicon.ico") ||
    p.endsWith(".svg") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(p)
  );
}

function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) {
    // Append each Set-Cookie safely (Next may join them with commas)
    setCookie.split(",").forEach((c) => to.headers.append("set-cookie", c.trim()));
  }
  return to;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  // Skip assets & API
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return res;
  }

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
    pathname.startsWith("/portal");

  // Lightweight profile flags (RLS must allow the user to read their own row)
  let role: UserRole | null = null;
  let completed = false;
  if (session?.user) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();
      role = profile?.role ?? null;
      completed = !!profile?.completed_onboarding;
    } catch {
      // don't block on errors — we'll treat as not completed
    }
  }

  // Signed-in landing → dashboard/onboarding
  if (pathname === "/" && session?.user) {
    const to = role && completed ? "/dashboard" : "/onboarding";
    return withSupabaseCookies(res, NextResponse.redirect(new URL(to, req.url)));
  }

  // Public routes pass (with a couple of signed-in conveniences)
  if (isPublic) {
    // If already signed in and hitting auth pages, bounce to redirect or app
    if (session?.user && (pathname.startsWith("/sign-in") || pathname.startsWith("/signup"))) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");
      const to = redirectParam || (role && completed ? "/dashboard" : "/onboarding");
      return withSupabaseCookies(res, NextResponse.redirect(new URL(to, req.url)));
    }

    // If fully onboarded, keep you off /onboarding (shouldn’t be public anyway, but guard just in case)
    if (pathname.startsWith("/onboarding") && session?.user && role && completed) {
      return withSupabaseCookies(res, NextResponse.redirect(new URL("/dashboard", req.url)));
    }

    return res;
  }

  // Protected from here
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return withSupabaseCookies(res, NextResponse.redirect(login));
  }

  // Require onboarding before any protected area
  if (!completed && !pathname.startsWith("/onboarding")) {
    return withSupabaseCookies(res, NextResponse.redirect(new URL("/onboarding", req.url)));
  }

  return res;
}

export const config = {
  matcher: [
    "/",
    "/compare-plans",
    "/subscribe",
    "/confirm",
    "/signup",
    "/sign-in",
    "/portal",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
  ],
};