// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

const PUBLIC_PATHS = new Set([
  "/sign-in",
  "/signup",
  "/subscribe",
  "/compare-plans",
  "/confirm",
  "/portal",
  "/coming-soon",
]);

function isAssetPath(p: string) {
  return (
    p.startsWith("/_next") ||
    p.startsWith("/api/auth") ||              // next-auth/supabase helpers sometimes touch these
    p.startsWith("/fonts") ||
    p.startsWith("/images") ||
    p.startsWith("/icons") ||
    p.startsWith("/_vercel") ||              // vercel internals
    p.endsWith("/favicon.ico") ||
    p.endsWith("/robots.txt") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map|svg|txt)$/i.test(p)
  );
}

// Preserve Set-Cookie on redirects/rewrites
function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) {
    // Next joins multiple Set-Cookie values with commas; append safely.
    for (const c of setCookie.split(",")) to.headers.append("set-cookie", c.trim());
  }
  return to;
}

export async function middleware(req: NextRequest) {
  // 1) Always create the response first so Supabase can attach refreshed cookies to it.
  const res = NextResponse.next();

  // 2) Ignore non-HTML traffic and static assets (reduces spurious cookie churn).
  if (req.method === "OPTIONS" || req.method === "HEAD") return res;
  const { pathname, search } = req.nextUrl;
  if (isAssetPath(pathname) || pathname.startsWith("/api")) return res;

  // 3) Refresh/inspect session (this call sets/refreshes cookies on `res`).
  const supabase = createMiddlewareClient<Database>({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // TEMP diagnostic header you can watch in Network tab (harmless in prod)
  if (process.env.NODE_ENV !== "production") {
    res.headers.set("x-auth", session?.user ? "yes" : "no");
  }

  // 4) Public routes
  if (PUBLIC_PATHS.has(pathname)) {
    // Already signed-in? Kick away from sign-in/up
    if ((pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      const to = new URL("/dashboard", req.url);
      return withSupabaseCookies(res, NextResponse.redirect(to));
    }
    return res; // public page
  }

  // 5) Root allow-list (unchanged)
  if (pathname === "/") {
    if (!session?.user) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect", "/dashboard");
      return withSupabaseCookies(res, NextResponse.redirect(url));
    }
    const allow = new Set(
      (process.env.ALLOWLIST_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
    const email = (session.user.email ?? "").toLowerCase();
    if (!allow.has(email)) {
      return withSupabaseCookies(res, NextResponse.rewrite(new URL("/coming-soon", req.url)));
    }
  }

  // 6) Auth gate for protected routes
  if (!session?.user) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect", `${pathname}${search}`);
    return withSupabaseCookies(res, NextResponse.redirect(url));
  }

  // 7) Profile lookup ONLY where you actually need it
  //    Doing DB reads inside middleware can trip RLS if something’s off.
  //    Keep it, but scope it to the pages that need the onboarding redirect.
  let role: UserRole | null = null;
  let completed = false;
  let gotProfile = false;

  if (pathname === "/" || pathname.startsWith("/dashboard")) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile) {
        gotProfile = true;
        role = (profile as any).role ?? null;
        completed = !!(profile as any).completed_onboarding;
      }
    } catch {
      // ignore; don’t block navigation
    }
  }

  if (pathname === "/") {
    const to = gotProfile && role && completed ? "/dashboard" : "/onboarding";
    return withSupabaseCookies(res, NextResponse.redirect(new URL(to, req.url)));
  }

  if (pathname.startsWith("/dashboard") && gotProfile && role && completed === false) {
    return withSupabaseCookies(res, NextResponse.redirect(new URL("/onboarding", req.url)));
  }

  // 8) Default allow
  return res;
}

// Be explicit about what’s protected so we don’t run middleware for unnecessary routes.
export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/customers/:path*",     // add if you have customer pages
    "/sign-in",
    "/signup",
    "/subscribe",
    "/compare-plans",
    "/confirm",
    "/portal",
    "/coming-soon",
  ],
};