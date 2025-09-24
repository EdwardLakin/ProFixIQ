// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/signup",
  "/subscribe",
  "/compare-plans",
  "/confirm",
  "/portal",
  "/coming-soon",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isAssetPath(p: string) {
  return (
    p.startsWith("/_next") ||
    p.startsWith("/fonts") ||
    p.endsWith("/favicon.ico") ||
    p.endsWith(".svg") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(p)
  );
}

// carry Set-Cookie from `from` to `to`
function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) {
    // Next may join multiple cookies by comma; append to be safe.
    for (const c of setCookie.split(",")) to.headers.append("set-cookie", c.trim());
  }
  return to;
}

export async function middleware(req: NextRequest) {
  // Always start from a NextResponse.next() and *pass it into* createMiddlewareClient.
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  // Fast exit for assets & API
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return res;
  }

  // Read session (this mutates cookies on res; keep using THIS res thereafter)
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();

  // attach cheap debug headers visible in network inspector
  res.headers.set("x-mw-path", pathname);
  res.headers.set("x-mw-has-session", session?.user ? "true" : "false");
  if (sessionErr) res.headers.set("x-mw-session-error", String(sessionErr?.message ?? "unknown"));

  // Public routes: let authed users skip auth pages
  if (isPublicPath(pathname)) {
    if ((pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      const to = new URL("/dashboard", req.url);
      return withSupabaseCookies(res, NextResponse.redirect(to));
    }
    return res;
  }

  // Home: send somewhere sensible but keep it simple
  if (pathname === "/") {
    if (!session?.user) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect", "/dashboard");
      return withSupabaseCookies(res, NextResponse.redirect(url));
    }
    const to = new URL("/dashboard", req.url);
    return withSupabaseCookies(res, NextResponse.redirect(to));
  }

  // Protected: only guard the app areas
  const PROTECTED_PREFIXES = [
    "/dashboard",
    "/work-orders",
    "/inspections",
    "/customers",
    "/parts",
    "/menu",
    "/settings",
  ];

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isProtected && !session?.user) {
    // If the auth helper hasn’t finished setting cookies on first hit,
    // allow a single pass-through for client boot by not redirecting on GET
    // if we *do* have Supabase cookies present. Otherwise, redirect.
    const hasSbCookie =
      req.cookies.has("sb-access-token") || req.cookies.has("sb-refresh-token") || req.cookies.has("sb:token");
    res.headers.set("x-mw-has-sb-cookie", hasSbCookie ? "true" : "false");

    if (!hasSbCookie) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect", `${pathname}${search}`);
      return withSupabaseCookies(res, NextResponse.redirect(url));
    }
  }

  // Optional (non-blocking) profile check; don’t redirect if it fails
  try {
    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id,shop_id,role,completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.shop_id) res.headers.set("x-mw-shop-id", profile.shop_id);
      if (profile?.role) res.headers.set("x-mw-role", profile.role);
      if (profile && pathname === "/onboarding" && profile.completed_onboarding) {
        const to = new URL("/dashboard", req.url);
        return withSupabaseCookies(res, NextResponse.redirect(to));
      }
      if (pathname.startsWith("/dashboard") && profile && profile.completed_onboarding === false) {
        const to = new URL("/onboarding", req.url);
        return withSupabaseCookies(res, NextResponse.redirect(to));
      }
    }
  } catch (e: any) {
    // Never block on profile problems
    res.headers.set("x-mw-prof-err", String(e?.message ?? e));
  }

  // Let the request through with whatever cookies Supabase set
  return res;
}

export const config = {
  // Keep matcher minimal; the code itself skips assets & api
  matcher: [
    "/",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/customers/:path*",
    "/parts/:path*",
    "/menu/:path*",
    "/settings/:path*",
    "/sign-in",
    "/signup",
    "/subscribe",
    "/compare-plans",
    "/confirm",
    "/portal/:path*",
    "/coming-soon",
  ],
};