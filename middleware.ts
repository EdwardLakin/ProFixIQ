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

// Safer: forward all Set-Cookie headers (avoid splitting on commas)
function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  
  const getSetCookie = from.headers.getSetCookie?.bind(from.headers) as
    | (() => string[])
    | undefined;

  const cookiesArr = getSetCookie ? getSetCookie() : undefined;
  if (Array.isArray(cookiesArr)) {
    for (const c of cookiesArr) to.headers.append("set-cookie", c);
  } else {
    const single = from.headers.get("set-cookie");
    if (single) to.headers.append("set-cookie", single);
  }
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
    pathname.startsWith("/portal") ||
    pathname.startsWith("/onboarding");

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
      completed = false;
    }
  }

  // ---- Diagnostics (remove after debugging) ----
  // Shows in Vercel > Deployment > Logs
  console.log(
    "MW",
    JSON.stringify({
      path: pathname,
      uid: session?.user?.id ?? null,
      completed,
      isPublic,
    })
  );
  // ---------------------------------------------

  // Signed-in user on landing → go to dashboard or onboarding
  if (pathname === "/" && session?.user) {
    return withSupabaseCookies(
      res,
      NextResponse.redirect(new URL(completed ? "/dashboard" : "/onboarding", req.url))
    );
  }

  // Public routes
  if (isPublic) {
    // Signed-in user trying to visit auth pages → bounce to the right place
    if (session?.user && (pathname.startsWith("/sign-in") || pathname.startsWith("/signup"))) {
      const redirectParam = req.nextUrl.searchParams.get("redirect");
      const to = redirectParam || (completed ? "/dashboard" : "/onboarding");
      return withSupabaseCookies(res, NextResponse.redirect(new URL(to, req.url)));
    }
    // Finished users should not see /onboarding again
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

  // Only force onboarding if explicitly incomplete
  if (completed === false && !pathname.startsWith("/onboarding")) {
    return withSupabaseCookies(res, NextResponse.redirect(new URL("/onboarding", req.url)));
  }

  return res;
}

export const config = {
  matcher: [
    "/",                       // landing
    "/compare-plans",
    "/subscribe",
    "/confirm",
    "/signup",
    "/sign-in",
    "/portal",
    "/onboarding/:path*",

    // ---- protected app areas (expand as you add features) ----
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/parts/:path*",
    "/tech/:path*",
    "/chat/:path*",
    "/appointments/:path*",
    "/menu", // service menu
  ],
};