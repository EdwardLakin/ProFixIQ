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

  // Session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ----- Coming Soon allowlist on "/" -----
  if (pathname === "/") {
    if (!session?.user) {
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
    // fall through to profile check below
  }

  // Public pages
  if (PUBLIC_PATHS.has(pathname)) {
    if ((pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return res;
  }

  // Protected app
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  // Read profile; if it fails, do NOT force onboarding
  let role: UserRole | null = null;
  let completed = false;
  let gotProfile = false;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profile) {
      gotProfile = true;
      role = profile.role ?? null;
      completed = !!profile.completed_onboarding;
    }
  } catch {
    gotProfile = false; // treat as unknown
  }

  // If you land on "/" (and passed allowlist) choose destination
  if (pathname === "/") {
    const to = gotProfile && role && completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // Only gate dashboard when we positively know onboarding is incomplete
  if (pathname.startsWith("/dashboard") && gotProfile && role && completed === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

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