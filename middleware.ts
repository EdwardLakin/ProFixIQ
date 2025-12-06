// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAssetPath(p: string) {
  return (
    p.startsWith("/_next") ||
    p.startsWith("/fonts") ||
    p.endsWith("/favicon.ico") ||
    p.endsWith(".svg") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(p)
  );
}

/**
 * Very lightweight auth check:
 * We *only* look for Supabase auth cookies.
 * Supabase itself (in your pages / API routes) still enforces RLS and
 * real auth – middleware just decides where to send the user.
 */
function isSignedIn(req: NextRequest): boolean {
  const access = req.cookies.get("sb-access-token")?.value;
  const refresh = req.cookies.get("sb-refresh-token")?.value;
  return Boolean(access || refresh);
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Let static assets and API routes through untouched
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const authed = isSignedIn(req);

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/mobile/sign-in"); // mobile companion sign-in is public

  // ---------------------- PUBLIC ROUTES ----------------------
  if (isPublic) {
    const isMainSignIn =
      pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
    const isMobileSignIn = pathname.startsWith("/mobile/sign-in");

    // If you're already signed in and hit any sign-in route → bounce
    if (authed && (isMainSignIn || isMobileSignIn)) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");

      let to: string;
      if (redirectParam) {
        to = redirectParam;
      } else if (isMobileSignIn) {
        // mobile companion default landing
        to = "/mobile";
      } else {
        // desktop default landing
        to = "/dashboard";
      }

      return NextResponse.redirect(new URL(to, req.url));
    }

    // Landing page: if already signed in, send to dashboard
    if (pathname === "/" && authed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Public page, not a special case → allow
    return NextResponse.next();
  }

  // ---------------------------------------------------------------------------
  // Protected routes from here (dashboard, work orders, inspections, mobile…)
  // ---------------------------------------------------------------------------

  if (!authed) {
    const isMobileRoute = pathname.startsWith("/mobile");
    const loginPath = isMobileRoute ? "/mobile/sign-in" : "/sign-in";
    const loginUrl = new URL(loginPath, req.url);
    loginUrl.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // Authed + protected path → let it through
  return NextResponse.next();
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
    "/mobile/sign-in", // explicitly run middleware here too
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/mobile/:path*", // protected mobile companion routes
    "/parts/:path*",
    "/tech/:path*",
    "/menu",
    "/billing",
  ],
};