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

// 👇 helper: preserve cookies set on `res` when redirecting/rewriting
function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  const setCookie = from.headers.get("set-cookie");
  if (setCookie) {
    // multiple cookies are joined by comma by Next; append is safer
    const parts = setCookie.split(","); // naive split is fine for Set-Cookie
    for (const c of parts) to.headers.append("set-cookie", c.trim());
  }
  return to;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return res;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // "/" allowlist
  if (pathname === "/") {
    if (!session?.user) {
      const url = new URL("/sign-in", req.url);
      url.searchParams.set("redirect", "/dashboard");
      return withSupabaseCookies(res, NextResponse.redirect(url));
    }
    const allow = new Set(
      (process.env.ALLOWLIST_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
    const email = (session.user.email ?? "").toLowerCase();
    if (!allow.has(email)) {
      return withSupabaseCookies(res, NextResponse.rewrite(new URL("/coming-soon", req.url)));
    }
  }

  // Public
  if (PUBLIC_PATHS.has(pathname)) {
    if ((pathname === "/sign-in" || pathname === "/signup") && session?.user) {
      return withSupabaseCookies(res, NextResponse.redirect(new URL("/dashboard", req.url)));
    }
    return res;
  }

  // Protected
  if (!session?.user) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("redirect", `${pathname}${search}`);
    return withSupabaseCookies(res, NextResponse.redirect(url));
  }

  // Profile lookup (make sure your profiles RLS lets a user read their own row)
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
      role = (profile as any).role ?? null;
      completed = !!(profile as any).completed_onboarding;
    }
  } catch {
    // ignore; don't block
  }

  if (pathname === "/") {
    const to = gotProfile && role && completed ? "/dashboard" : "/onboarding";
    return withSupabaseCookies(res, NextResponse.redirect(new URL(to, req.url)));
  }

  if (pathname.startsWith("/dashboard") && gotProfile && role && completed === false) {
    return withSupabaseCookies(res, NextResponse.redirect(new URL("/onboarding", req.url)));
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