// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Public pages that anyone can view
const PUBLIC_PATHS = new Set<string>([
  "/",                 // landing
  "/sign-in",
  "/signup",
  "/subscribe",
  "/compare-plans",
  "/confirm",          // magic-link confirmation
  "/portal",
  "/coming-soon",
  "/plans",
  "/pricing",
]);

function isAssetPath(p: string) {
  return (
    p.startsWith("/_next") ||
    p.startsWith("/fonts") ||
    p.startsWith("/api") || // let API routes handle their own auth
    p.endsWith("/favicon.ico") ||
    p.endsWith(".svg") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(p)
  );
}

// Preserve cookies that Supabase may have set on `res`
function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) {
    for (const c of setCookie.split(",")) to.headers.append("set-cookie", c.trim());
  }
  return to;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });
  const { pathname, search } = req.nextUrl;

  // Skip static assets & API
  if (isAssetPath(pathname)) return res;

  // Always fetch session (keeps cookies fresh)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Helper to look up onboarding state (RLS must allow user to read their own row)
  const needsOnboarding = async (): Promise<boolean> => {
    if (!session?.user) return true;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();
      return !prof?.completed_onboarding;
    } catch {
      // If we can’t read the profile (e.g., RLS misconfig), fail safe to "needs onboarding"
      return true;
    }
  };

  // Public routes are allowed — but we may redirect authenticated users per flow
  if (PUBLIC_PATHS.has(pathname)) {
    if (session?.user) {
      const needs = await needsOnboarding();
      // Authenticated user who hasn't finished onboarding: always land on /onboarding
      if (needs && pathname !== "/onboarding") {
        return withSupabaseCookies(res, NextResponse.redirect(new URL("/onboarding", req.url)));
      }
      // If they visit sign-in/signup while already signed in: route to the right place
      if ((pathname === "/sign-in" || pathname === "/signup") && !needs) {
        return withSupabaseCookies(res, NextResponse.redirect(new URL("/dashboard", req.url)));
      }
    }
    return res;
  }

  // Onboarding route itself
  if (pathname === "/onboarding") {
    if (!session?.user) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect", "/onboarding");
      return withSupabaseCookies(res, NextResponse.redirect(url));
    }
    const needs = await needsOnboarding();
    if (!needs) {
      return withSupabaseCookies(res, NextResponse.redirect(new URL("/dashboard", req.url)));
    }
    return res; // signed in and still needs onboarding → allow
  }

  // All other matched routes are protected
  if (!session?.user) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect", `${pathname}${search}`);
    return withSupabaseCookies(res, NextResponse.redirect(url));
  }

  // Signed in; check onboarding
  const needs = await needsOnboarding();
  if (needs) {
    return withSupabaseCookies(res, NextResponse.redirect(new URL("/onboarding", req.url)));
  }

  // Signed in and onboarded → allow
  return res;
}

// Where middleware should run.
// (We include public routes so we can refresh the session cookie and apply the
// "redirect to onboarding if not completed" behavior on landing and auth pages.)
export const config = {
  matcher: [
    "/",                 // landing (public, but may redirect to /onboarding if needed)
    "/sign-in",
    "/signup",
    "/subscribe",
    "/compare-plans",
    "/confirm",
    "/portal",
    "/coming-soon",
    "/plans",
    "/pricing",

    // Onboarding (requires auth)
    "/onboarding",

    // Protected sections
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/customers/:path*",
    "/parts/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};