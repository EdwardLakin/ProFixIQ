// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

function buildAllow(): Set<string> {
  return new Set(
    (process.env.ALLOWLIST_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const allow = buildAllow();
  const email = (session?.user?.email ?? "").toLowerCase();
  const isAllowlisted = email && allow.has(email);

  const isAuthPage = pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
  const isPublicMarketing =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/portal");

  // --- Lock down marketing/public pages for everyone except allow-listed ---
  // /sign-in stays open so you can log in.
  if (isPublicMarketing && !isAuthPage && !isAllowlisted) {
    // Special case landing: if not signed in, send to sign-in with redirect
    if (pathname === "/" && !session?.user) {
      const login = new URL("/sign-in", req.url);
      login.searchParams.set("redirect", "/dashboard");
      return NextResponse.redirect(login);
    }
    // Signed in but not allow-listed (or anonymous on other public pages) -> Coming Soon
    return NextResponse.rewrite(new URL("/coming-soon", req.url));
  }

  // If NOT signed in and you hit the landing page, go straight to sign-in
  if (pathname === "/" && !session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", "/dashboard");
    return NextResponse.redirect(login);
  }

  // If signed in but not allow-listed and you hit landing, show Coming Soon
  if (pathname === "/" && session?.user && !isAllowlisted) {
    return NextResponse.rewrite(new URL("/coming-soon", req.url));
  }

  // Fetch profile (role + onboarding) for signed-in users
  let role: UserRole | null = null;
  let completed = false;
  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();
    role = profile?.role ?? null;
    completed = !!profile?.completed_onboarding;
  }

  // Keep signed-in users off auth pages
  if (isAuthPage && session?.user) {
    const to = role && completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // Protect the app sections
  const needsAuth =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/work-orders") ||
    pathname.startsWith("/inspections");
  if (needsAuth && !session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding inside dashboard if not complete
  if (pathname.startsWith("/dashboard") && !(role && completed)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

// Run middleware on (almost) everything except static assets/_next
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|css|js|map)).*)',
  ],
};