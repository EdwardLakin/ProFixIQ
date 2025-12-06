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
  if (setCookie) {
    to.headers.set("set-cookie", setCookie);
  }
  return to;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 🔹 Skip static assets + API routes completely (no Supabase call)
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  // ---------------------------------------------------------------------------
  // Session + onboarding state
  // ---------------------------------------------------------------------------
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
    pathname.startsWith("/portal") ||
    pathname.startsWith("/mobile/sign-in"); // ✅ mobile companion sign-in is public

  // Treat EITHER completed_onboarding = true OR shop_id IS NOT NULL
  // as "this user is allowed into the app"
  let completed = false;
  if (session?.user) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding, shop_id")
        .eq("id", session.user.id)
        .limit(1)
        .maybeSingle();

      const hasShop = !!profile?.shop_id;
      const didOnboarding = !!profile?.completed_onboarding;

      completed = didOnboarding || hasShop;
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
  // PUBLIC ROUTES (marketing, sign-in, portal, mobile sign-in)
  // ---------------------------------------------------------------------------
  if (isPublic) {
    const isMainSignIn =
      pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
    const isMobileSignIn = pathname.startsWith("/mobile/sign-in");

    // If you're signed in and hit ANY sign-in route → bounce to app
    if (session?.user && (isMainSignIn || isMobileSignIn)) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");

      let to: string;
      if (redirectParam) {
        to = redirectParam;
      } else if (isMobileSignIn) {
        // mobile companion goes to mobile dashboard once onboarded
        to = completed ? "/mobile" : "/onboarding";
      } else {
        // normal sign-in keeps existing behavior
        to = completed ? "/dashboard" : "/onboarding";
      }

      const target = new URL(to, req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    // Don’t let already-complete users sit on /onboarding
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
      const target = new URL("/dashboard", req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    // Public route, no special handling
    return res;
  }

  // ---------------------------------------------------------------------------
  // PROTECTED ROUTES (dashboard, work orders, inspections, mobile, etc.)
  // ---------------------------------------------------------------------------

  // Not signed in → send to correct sign-in with redirect
  if (!session?.user) {
    const isMobileRoute = pathname.startsWith("/mobile");

    const loginPath = isMobileRoute ? "/mobile/sign-in" : "/sign-in";
    const login = new URL(loginPath, req.url);
    login.searchParams.set("redirect", pathname + search);

    return withSupabaseCookies(res, NextResponse.redirect(login));
  }

  // Signed in but NOT completed onboarding → force onboarding
  if (!completed && !pathname.startsWith("/onboarding")) {
    const target = new URL("/onboarding", req.url);
    return withSupabaseCookies(res, NextResponse.redirect(target));
  }

  // Normal case: authed + completed → continue
  return res;
}

// Paths that run through middleware
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
    "/tech/queue"
  ],
};