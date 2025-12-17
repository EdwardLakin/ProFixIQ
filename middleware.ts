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

// Don’t split multi-cookie header; copy as-is
function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) to.headers.set("set-cookie", setCookie);
  return to;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Skip static assets + API routes
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  const isPortalAuthPage =
    pathname === "/portal/signin" ||
    pathname === "/portal/confirm" ||
    pathname === "/portal/confirm/" ||
    pathname.startsWith("/portal/confirm");

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/mobile/sign-in") ||
    isPortalAuthPage; // ✅ ONLY portal auth pages are public

  // ---------------------------------------------------------------------------
  // App onboarding state (ONLY for main app users, not portal customers)
  // ---------------------------------------------------------------------------
  let completed = false;
  if (session?.user && !isPortal) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding, shop_id")
        .eq("id", session.user.id)
        .limit(1)
        .maybeSingle();

      completed = !!profile?.completed_onboarding || !!profile?.shop_id;
    } catch {
      completed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Landing page → redirect into app/onboarding when already signed in
  // ---------------------------------------------------------------------------
  if (pathname === "/" && session?.user) {
    const target = new URL(completed ? "/dashboard" : "/onboarding", req.url);
    return withSupabaseCookies(res, NextResponse.redirect(target));
  }

  // ---------------------------------------------------------------------------
  // PUBLIC ROUTES
  // ---------------------------------------------------------------------------
  if (isPublic) {
    // If signed in and hit main sign-in routes → bounce into app
    const isMainSignIn =
      pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
    const isMobileSignIn = pathname.startsWith("/mobile/sign-in");

    if (session?.user && (isMainSignIn || isMobileSignIn)) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");

      let to: string;
      if (redirectParam) {
        to = redirectParam;
      } else if (isMobileSignIn) {
        to = completed ? "/mobile" : "/onboarding";
      } else {
        to = completed ? "/dashboard" : "/onboarding";
      }

      const target = new URL(to, req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    // Portal auth pages:
    // - If already signed in and go to /portal/signin, bounce to /portal
    if (isPortal && session?.user && pathname === "/portal/signin") {
      const target = new URL("/portal", req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    return res;
  }

  // ---------------------------------------------------------------------------
  // PROTECTED ROUTES
  // ---------------------------------------------------------------------------

  // Not signed in → route to correct login with redirect
  if (!session?.user) {
    if (isPortal) {
      const login = new URL("/portal/sign-in", req.url);
      login.searchParams.set("redirect", pathname + search);
      return withSupabaseCookies(res, NextResponse.redirect(login));
    }

    const isMobileRoute = pathname.startsWith("/mobile");
    const loginPath = isMobileRoute ? "/mobile/sign-in" : "/sign-in";
    const login = new URL(loginPath, req.url);
    login.searchParams.set("redirect", pathname + search);

    return withSupabaseCookies(res, NextResponse.redirect(login));
  }

  // Main-app users: signed in but NOT completed onboarding → force onboarding
  if (!isPortal && !completed && !pathname.startsWith("/onboarding")) {
    const target = new URL("/onboarding", req.url);
    return withSupabaseCookies(res, NextResponse.redirect(target));
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
    "/portal/:path*",
    "/mobile/sign-in",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/mobile/:path*",
    "/parts/:path*",
    "/tech/queue",
  ],
};