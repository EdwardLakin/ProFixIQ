// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
    p.startsWith("/fonts") ||
    p.endsWith("/favicon.ico") ||
    p.endsWith(".svg") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(p)
  );
}

export async function middleware(req: NextRequest) {
  // If this request is for static assets or API, skip entirely
  const { pathname, search } = req.nextUrl;
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Always create a response first and pass it into Supabase client
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  // Get session (forces cookie -> session hydration if needed)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public pages: allow through, and if already authed, let client handle redirects
  if (PUBLIC_PATHS.has(pathname)) {
    return res;
  }

  // Protected pages: if no session, send to sign-in with a redirect back
  if (!session?.user) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect", `${pathname}${search || ""}`);
    // Important: return the SAME `res` instance we gave to Supabase (cookies preserved)
    return NextResponse.redirect(url, { headers: res.headers });
  }

  // Otherwise, allow through (cookies already attached to `res`)
  return res;
}

// Scope to just the areas that truly need auth
export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/sign-in",
    "/signup",
    "/subscribe",
    "/compare-plans",
    "/confirm",
    "/portal",
    "/coming-soon",
  ],
};