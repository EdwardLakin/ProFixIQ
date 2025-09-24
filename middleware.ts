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
  // Always start with a response instance that Supabase can write cookies to.
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  // Pass through assets & API without auth work.
  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return res;
  }

  // Ensure session (and allow Supabase to refresh cookies on res if needed).
  let sessionUserId: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    sessionUserId = session?.user?.id ?? null;
  } catch {
    // ignore – fall through to auth checks below
  }

  // Root gate ("/")
  if (pathname === "/") {
    if (!sessionUserId) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect", "/dashboard");
      return NextResponse.redirect(url);
    }
    const allow = new Set(
      (process.env.ALLOWLIST_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
    const email = (req.headers.get("x-supa-email") ?? "").toLowerCase(); // may be absent; allowlist is optional
    if (allow.size && !allow.has(email)) {
      return NextResponse.rewrite(new URL("/coming-soon", req.url));
    }
  }

  // Public pages
  if (PUBLIC_PATHS.has(pathname)) {
    if ((pathname === "/sign-in" || pathname === "/signup") && sessionUserId) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return res;
  }

  // Protected pages
  if (!sessionUserId) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Profile lookup (don’t block if RLS prevents it)
  let role: UserRole | null = null;
  let completed = false;
  let gotProfile = false;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", sessionUserId)
      .maybeSingle();
    if (profile) {
      gotProfile = true;
      role = (profile as any).role ?? null;
      completed = !!(profile as any).completed_onboarding;
    }
  } catch {
    // ignore; keep navigating
  }

  if (pathname === "/") {
    const to = gotProfile && role && completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  if (pathname.startsWith("/dashboard") && gotProfile && role && completed === false) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // ✅ Important: return the *same* `res` that Supabase wrote cookies to.
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