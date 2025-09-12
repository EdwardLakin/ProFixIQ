// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

function parseAllowlist(env: string | undefined): Set<string> {
  return new Set(
    (env ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;

  // Public assets/routes that must keep working
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/coming-soon") || // <- allow the lock page itself
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||  // optional: keep a public API area
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  // Read current session (email) for allowlist check
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const allow = parseAllowlist(process.env.ALLOWLIST_EMAILS);
  const userEmail = session?.user?.email?.toLowerCase() ?? null;
  const isAllowlisted = userEmail ? allow.has(userEmail) : false;

  // If not allowlisted and not on a public path → send to Coming Soon
  if (!isAllowlisted && !isPublic) {
    const to = new URL("/coming-soon", req.url);
    // keep where they were trying to go (nice when you later open access)
    to.searchParams.set("next", pathname + search);
    return NextResponse.redirect(to);
  }

  // ----- From here down = your original logic (applies only when allowlisted) -----

  // If an allowlisted signed-in user lands on "/", route them to app
  if (pathname === "/" && session?.user) {
    // fetch role + onboarding state
    let role: UserRole | null = null;
    let completed = false;
    if (session.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, completed_onboarding")
        .eq("id", session.user.id)
        .maybeSingle();
      role = profile?.role ?? null;
      completed = !!profile?.completed_onboarding;
    }

    const to = role && completed ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  // If the path is public, allow it (with small QoL redirects)
  if (isPublic) {
    // Keep signed-in users off auth pages
    if ((pathname.startsWith("/sign-in") || pathname.startsWith("/signup")) && session?.user) {
      const to = new URL("/dashboard", req.url);
      return NextResponse.redirect(to);
    }
    return res;
  }

  // Protected branches
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding when entering dashboard without completion
  let role: UserRole | null = null;
  let completed = false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, completed_onboarding")
    .eq("id", session.user.id)
    .maybeSingle();
  role = profile?.role ?? null;
  completed = !!profile?.completed_onboarding;

  if (pathname.startsWith("/dashboard") && !(role && completed)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

// Run middleware on app pages; keep static assets skipped.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};