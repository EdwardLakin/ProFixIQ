// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

const PUBLIC_PATHS = new Set<string>([
  "/sign-in",
  "/signup",
  "/subscribe",
  "/compare-plans",
  "/confirm",
  "/portal",
  "/coming-soon",
]);

function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith(".svg") ||
    // static assets (images, css, js, maps, etc.)
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(pathname)
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname } = req.nextUrl;

  // Skip assets & API
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return res;
  }

  // Session (ok if null for public pages)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ----------------------------
  // Coming Soon allowlist (root)
  // ----------------------------
  if (pathname === "/") {
    // Not signed in -> take them straight to /sign-in, then to /dashboard
    if (!session?.user) {
      const login = new URL("/sign-in", req.url);
      login.searchParams.set("redirect", "/dashboard");
      return NextResponse.redirect(login);
    }

    // Signed in: enforce allowlist on the landing page
    const allowList = (process.env.ALLOWLIST_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const allow = new Set<string>(allowList);

    const email = (session.user.email ?? "").toLowerCase();
    if (!allow.has(email)) {
      return NextResponse.rewrite(new URL("/coming-soon", req.url));
    }
    // If allowlisted, we’ll fall through to profile checks below
  }

  // ------------------------------------
  // Public pages (auth/marketing/etc.)
  // ------------------------------------
  if (PUBLIC_PATHS.has(pathname)) {
    // Keep signed-in users off auth pages
    if ((pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return res;
  }

  // ------------------------------------
  // Protected application routes
  // ------------------------------------
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    // preserve original destination
    login.searchParams.set("redirect", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  // Fetch profile (role + completed_onboarding)
  let role: UserRole | null = null;
  let completed = false;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    role = profile?.role ?? null;
    completed = !!profile?.completed_onboarding;
  } catch {
    // If this fails (RLS/latency), treat as unknowns; do not hard-block.
  }

  // If user hits "/" (and passed allowlist), choose where to send them.
  if (pathname === "/") {
    // Use role in the decision so it isn't "declared and never used"
    // Policy: they must have a role AND be completed to reach dashboard.
    const to = role && completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // Gate onboarding INSIDE the app: if they’re trying to use dashboard without completing it
  if (pathname.startsWith("/dashboard") && role && completed === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // If they have no role yet (new account), send them to onboarding as well
  if (pathname.startsWith("/dashboard") && !role) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

// Run middleware on root + app sections + public auth/marketing routes
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