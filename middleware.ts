// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

/** Detect static assets (skip middleware for these). */
function isAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|svg|map)$/i.test(pathname)
  );
}

/** Ensures Supabase auth cookies are passed through correctly. */
function forwardAuthCookies(res: NextResponse, supaRes: NextResponse) {
  const setCookie = supaRes.headers.get("set-cookie");
  if (setCookie) res.headers.set("set-cookie", setCookie);
  return res;
}

export async function middleware(req: NextRequest) {
  // Must be created BEFORE any early returns
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  // Skip static + API
  if (isAsset(pathname) || pathname.startsWith("/api")) {
    return res;
  }

  // Get session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public routes
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/mobile/sign-in");

  // Additional gating info
  let completed = false;

  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("completed_onboarding, shop_id")
      .eq("id", session.user.id)
      .maybeSingle();

    const hasShop = !!profile?.shop_id;
    const didOnboarding = !!profile?.completed_onboarding;
    completed = hasShop || didOnboarding;
  }

  // Signed-in user hits "/" → redirect to dashboard or onboarding
  if (pathname === "/" && session?.user) {
    return forwardAuthCookies(
      NextResponse.redirect(
        new URL(completed ? "/dashboard" : "/onboarding", req.url)
      ),
      res
    );
  }

  // PUBLIC ROUTES HANDLING
  if (isPublic) {
    const isMainSignIn =
      pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
    const isMobileSignIn = pathname.startsWith("/mobile/sign-in");

    // Already signed-in users should NOT view sign-in pages
    if (session?.user && (isMainSignIn || isMobileSignIn)) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");

      const target = redirectParam
        ? redirectParam
        : isMobileSignIn
        ? completed
          ? "/mobile"
          : "/onboarding"
        : completed
        ? "/dashboard"
        : "/onboarding";

      return forwardAuthCookies(
        NextResponse.redirect(new URL(target, req.url)),
        res
      );
    }

    // Signed-in AND completed → don’t let them remain on onboarding
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
      return forwardAuthCookies(
        NextResponse.redirect(new URL("/dashboard", req.url)),
        res
      );
    }

    return res;
  }

  // PROTECTED ROUTES BELOW

  // 1) Not signed in?
  if (!session?.user) {
    const isMobile = pathname.startsWith("/mobile");
    const login = new URL(isMobile ? "/mobile/sign-in" : "/sign-in", req.url);

    login.searchParams.set("redirect", pathname + search);

    return forwardAuthCookies(NextResponse.redirect(login), res);
  }

  // 2) Force onboarding if incomplete
  if (!completed && !pathname.startsWith("/onboarding")) {
    return forwardAuthCookies(
      NextResponse.redirect(new URL("/onboarding", req.url)),
      res
    );
  }

  // Default → continue
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
  ],
};