// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
  if (setCookie) setCookie.split(",").forEach((c) => to.headers.append("set-cookie", c.trim()));
  return to;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;
  if (isAssetPath(pathname) || pathname.startsWith("/api")) return res;

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

  // Only the onboarding flag matters for routing decisions
  let completed = false;
  if (session?.user) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();
      completed = !!profile?.completed_onboarding;
    } catch {
      // treat as not completed if profile lookup fails
      completed = false;
    }
  }

  // Signed-in user on landing → go to dashboard or onboarding
  if (pathname === "/" && session?.user) {
    return withSupabaseCookies(
      res,
      NextResponse.redirect(new URL(completed ? "/dashboard" : "/onboarding", req.url))
    );
  }

  // Public routes
  if (isPublic) {
    // Signed-in user trying to visit auth pages → bounce to right place
    if (session?.user && (pathname.startsWith("/sign-in") || pathname.startsWith("/signup"))) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");
      const to = redirectParam || (completed ? "/dashboard" : "/onboarding");
      return withSupabaseCookies(res, NextResponse.redirect(new URL(to, req.url)));
    }
    // If already finished, keep them off /onboarding even if linked
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
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

  // Only force onboarding if we explicitly know it's not completed
if (completed === false && !pathname.startsWith("/onboarding")) {
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