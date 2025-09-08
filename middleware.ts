// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Single home for all staff roles now.
const STAFF_HOME = "/dashboard";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const { pathname, search } = req.nextUrl;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Public routes that never need auth
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/fonts") ||
    pathname.endsWith("/favicon.ico") ||
    pathname.endsWith("/logo.svg");

  // Get lightweight profile gates only when logged in
  let completed = false;
  if (session?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("completed_onboarding")
      .eq("id", session.user.id)
      .maybeSingle();

    completed = !!profile?.completed_onboarding;
  }

  // Signed-in user hitting root → send to unified dashboard or onboarding
  if (pathname === "/" && session?.user) {
    const to = completed ? STAFF_HOME : "/onboarding";
    return NextResponse.redirect(new URL(to, req.url));
  }

  if (isPublic) {
    // If they already finished onboarding, keep them off onboarding pages
    if (pathname.startsWith("/onboarding") && session?.user && completed) {
      return NextResponse.redirect(new URL(STAFF_HOME, req.url));
    }
    return res;
  }

  // ---- Protected branches (keep these minimal) ----
  // NOTE: We no longer protect /dashboard in middleware; the client layout/AuthGate handles that.
  if (!session?.user) {
    const login = new URL("/sign-in", req.url);
    login.searchParams.set("redirect", pathname + search);
    return NextResponse.redirect(login);
  }

  // Force onboarding when visiting protected areas and onboarding not complete
  if (!completed && (pathname.startsWith("/work-orders") || pathname.startsWith("/inspections"))) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return res;
}

// Only protect app areas that truly require an already-established session.
// Leave /dashboard to the client-side guard to prevent post-login "flash back".
export const config = {
  matcher: [
    "/work-orders/:path*",
    "/inspections/:path*",
    // add more protected branches here if needed
  ],
};