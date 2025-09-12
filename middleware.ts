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

function isAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith(".svg") ||
    pathname.match(/\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i) !== null
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, searchParams } = req.nextUrl;

  // Skip assets & API
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return res;
  }

  // Session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // --- Coming Soon allowlist (root only) ---
  // Allow only emails in ALLOWLIST_EMAILS to see the app from "/".
  // Everyone else gets /coming-soon.
  if (pathname === "/") {
    if (!session?.user) {
      // Take you straight to sign-in and then to /dashboard
      const login = new URL("/sign-in", req.url);
      login.searchParams.set("redirect", "/dashboard");
      return NextResponse.redirect(login);
    }

    const allowList = (process.env.ALLOWLIST_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const allow = new Set<string>(allowList);

    const email = (session.user.email ?? "").toLowerCase();
    if (!allow.has(email)) {
      return NextResponse.rewrite(new URL("/coming-soon", req.url));
    }

    // Signed-in + allowlisted → fall through to app (we’ll redirect below)
  }

  // Public pages: let them through, but keep signed-in users off auth pages.
  if (PUBLIC_PATHS.has(pathname)) {
    if ((pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      const to = new URL("/dashboard", req.url);
      return NextResponse.redirect(to);
    }
    return res;
  }

  // From here down, protect the app routes
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  // If the user is signed-in, try to read profile. If it fails (e.g., RLS),
  // DO NOT force onboarding—just let them in (prevents false loops).
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
    // swallow; treat as unknown → don't gate onboarding below
  }

  // If you hit "/" (and passed allowlist), send you to dashboard or onboarding
  if (pathname === "/") {
    const to = completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // Gate onboarding ONLY when we know it's not completed
  if (pathname.startsWith("/dashboard") && completed === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

// Make sure middleware runs on "/" too
export const config = {
  matcher: [
    "/",                       // root
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