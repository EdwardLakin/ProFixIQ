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

function withSupabaseCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}

function safeRedirectPath(v: string | null): string | null {
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}

type PortalMode = "customer" | "fleet";

async function resolvePortalModeServer(
  supabase: ReturnType<typeof createMiddlewareClient<Database>>,
  userId: string,
): Promise<PortalMode> {
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (cust?.id) return "customer";
  } catch {
    // ignore
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", userId)
      .limit(1)
      .maybeSingle();

    const role = (profile?.role ?? null) as string | null;
    const isFleetRole =
      role === "driver" || role === "dispatcher" || role === "fleet_manager";

    if (profile?.id && isFleetRole && profile.shop_id) return "fleet";
  } catch {
    // ignore
  }

  return "customer";
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/work-orders/quote-review")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  const isPortalAuthPage = pathname.startsWith("/portal/auth/");
  const isLegacyPortalConfirm =
    pathname === "/portal/confirm" ||
    pathname === "/portal/confirm/" ||
    pathname.startsWith("/portal/confirm");

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/mobile/sign-in") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/reset") ||
    pathname.startsWith("/auth/set-password") ||
    pathname.startsWith("/demo") ||
    isPortalAuthPage ||
    isLegacyPortalConfirm;

  let completed = false;
  if (session?.user && !isPortal) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding, shop_id")
        .eq("id", session.user.id)
        .limit(1)
        .maybeSingle();

      completed = !!profile?.completed_onboarding || !!profile?.shop_id;
    } catch {
      completed = false;
    }
  }

  if (pathname === "/" && session?.user) {
    const target = new URL(completed ? "/dashboard" : "/onboarding", req.url);
    return withSupabaseCookies(res, NextResponse.redirect(target));
  }

  if (isPublic) {
    const redirectParam = safeRedirectPath(
      req.nextUrl.searchParams.get("redirect"),
    );

    const isMainSignIn =
      pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
    const isMobileSignIn = pathname.startsWith("/mobile/sign-in");

    if (session?.user && (isMainSignIn || isMobileSignIn)) {
      const to =
        redirectParam ??
        (isMobileSignIn
          ? completed
            ? "/mobile"
            : "/onboarding"
          : completed
            ? "/dashboard"
            : "/onboarding");

      const target = new URL(to, req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    if (
      isPortal &&
      session?.user &&
      (isPortalAuthPage || isLegacyPortalConfirm)
    ) {
      const mode = await resolvePortalModeServer(supabase, session.user.id);

      let to = redirectParam ?? (mode === "fleet" ? "/portal/fleet" : "/portal");

      if (
        mode === "fleet" &&
        to.startsWith("/portal") &&
        !to.startsWith("/portal/fleet")
      ) {
        to = "/portal/fleet";
      }
      if (mode === "customer" && to.startsWith("/portal/fleet")) {
        to = "/portal";
      }

      const target = new URL(to, req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    return res;
  }

  if (!session?.user) {
    if (isPortal) {
      const login = new URL("/portal/auth/sign-in", req.url);
      login.searchParams.set("redirect", pathname + search);
      return withSupabaseCookies(res, NextResponse.redirect(login));
    }

    const isMobileRoute = pathname.startsWith("/mobile");
    const loginPath = isMobileRoute ? "/mobile/sign-in" : "/sign-in";
    const login = new URL(loginPath, req.url);
    login.searchParams.set("redirect", pathname + search);

    return withSupabaseCookies(res, NextResponse.redirect(login));
  }

  if (isPortal) {
    const mode = await resolvePortalModeServer(supabase, session.user.id);

    const isFleetPortalPath =
      pathname === "/portal/fleet" || pathname.startsWith("/portal/fleet/");

    if (mode === "fleet" && !isFleetPortalPath) {
      const target = new URL("/portal/fleet", req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }

    if (mode === "customer" && isFleetPortalPath) {
      const target = new URL("/portal", req.url);
      return withSupabaseCookies(res, NextResponse.redirect(target));
    }
  }

  if (!isPortal && !completed && !pathname.startsWith("/onboarding")) {
    const target = new URL("/onboarding", req.url);
    return withSupabaseCookies(res, NextResponse.redirect(target));
  }

  return res;
}

export const config = {
  matcher: [
    "/",
    "/compare-plans",
    "/subscribe",
    "/confirm",
    "/signup",
    "/sign-in",
    "/forgot-password",
    "/auth/reset",
    "/auth/set-password",
    "/demo/:path*",
    "/portal/:path*",
    "/mobile/sign-in",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/mobile/:path*",
    "/parts/:path*",
    "/tech/queue",
  ],
};