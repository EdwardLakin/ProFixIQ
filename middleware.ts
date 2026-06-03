import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import {
  hasSupabasePublicEnv,
  readSupabasePublicEnv,
} from "@/features/shared/lib/supabase/public-env";

function isAssetPath(p: string) {
  return (
    p.startsWith("/_next") ||
    p.startsWith("/fonts") ||
    p.endsWith("/favicon.ico") ||
    p.endsWith(".svg") ||
    /\.(png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(p)
  );
}

function safeRedirectPath(v: string | null): string | null {
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}

type PortalMode = "customer" | "fleet";

function isShopBoostOrchestratedRole(role: string | null | undefined): boolean {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

function createMiddlewareSupabase(req: NextRequest, res: NextResponse) {
  const { supabaseUrl, supabaseAnonKey } = readSupabasePublicEnv("middleware");

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        });
      },
    },
  });
}

function logMiddlewareAuthDiagnostics(args: {
  pathname: string;
  userId: string | null;
  profile?: {
    shop_id?: string | null;
    role?: string | null;
    completed_onboarding?: boolean | null;
  } | null;
  profileError?: string | null;
}) {
  console.info("[auth/middleware-post-login]", {
    pathname: args.pathname,
    userId: args.userId,
    profileExists: Boolean(args.profile),
    profileShopId: args.profile?.shop_id ?? null,
    profileRole: args.profile?.role ?? null,
    completedOnboarding: args.profile?.completed_onboarding ?? null,
    profileError: args.profileError ?? null,
  });
}

async function resolvePortalModeServer(
  supabase: SupabaseClient<Database>,
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
    const actor = await resolveFleetActorContext(supabase, { userId });
    if (actor.capabilities.canAccessPortalFleetWrappers) return "fleet";
  } catch {
    // ignore
  }

  return "customer";
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-next-pathname", pathname);

  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/work-orders/quote-review")) {
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });

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

  if (isPublic && !hasSupabasePublicEnv()) {
    console.info("[auth/middleware-public-skip]", {
      pathname,
      hasNextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasNextPublicSupabaseAnonKey: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      ),
    });
    return res;
  }

  const supabase = createMiddlewareSupabase(req, res);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError && userError.message !== "Auth session missing!") {
    console.info("[auth/middleware-get-user]", {
      pathname,
      userId: null,
      error: userError.message,
    });
  }

  let completed = false;
  let needsShopBoostIntake = false;
  if (user && !isPortal) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("completed_onboarding, shop_id, role")
        .eq("id", user.id)
        .limit(1)
        .maybeSingle();

      logMiddlewareAuthDiagnostics({
        pathname,
        userId: user.id,
        profile,
        profileError: profileError?.message ?? null,
      });

      completed = !!profile?.completed_onboarding || !!profile?.shop_id;

      if (
        profile?.completed_onboarding &&
        profile?.shop_id &&
        isShopBoostOrchestratedRole(profile.role)
      ) {
        const { data: intake } = await supabase
          .from("shop_boost_intakes")
          .select("id")
          .eq("shop_id", profile.shop_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        needsShopBoostIntake = !intake?.id;
      }
    } catch (err) {
      logMiddlewareAuthDiagnostics({
        pathname,
        userId: user.id,
        profile: null,
        profileError:
          err instanceof Error ? err.message : "profile lookup failed",
      });
      completed = false;
      needsShopBoostIntake = false;
    }
  }

  if (pathname === "/" && user) {
    const target = new URL(
      !completed
        ? "/onboarding"
        : needsShopBoostIntake
          ? "/onboarding/shop-boost"
          : "/dashboard",
      req.url,
    );
    return NextResponse.redirect(target, { headers: res.headers });
  }

  if (isPublic) {
    const redirectParam = safeRedirectPath(
      req.nextUrl.searchParams.get("redirect"),
    );

    const isMainSignIn =
      pathname.startsWith("/sign-in") || pathname.startsWith("/signup");
    const isMobileSignIn = pathname.startsWith("/mobile/sign-in");

    if (user && (isMainSignIn || isMobileSignIn)) {
      const to =
        redirectParam ??
        (isMobileSignIn
          ? completed
            ? "/mobile"
            : "/onboarding"
          : !completed
            ? "/onboarding"
            : needsShopBoostIntake
              ? "/onboarding/shop-boost"
              : "/dashboard");

      const target = new URL(to, req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }

    if (isPortal && user && (isPortalAuthPage || isLegacyPortalConfirm)) {
      const mode = await resolvePortalModeServer(supabase, user.id);

      let to =
        redirectParam ?? (mode === "fleet" ? "/portal/fleet" : "/portal");

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
      return NextResponse.redirect(target, { headers: res.headers });
    }

    return res;
  }

  if (!user) {
    if (isPortal) {
      const login = new URL("/portal/auth/sign-in", req.url);
      login.searchParams.set("redirect", pathname + search);
      return NextResponse.redirect(login, { headers: res.headers });
    }

    const isMobileRoute = pathname.startsWith("/mobile");
    const loginPath = isMobileRoute ? "/mobile/sign-in" : "/sign-in";
    const login = new URL(loginPath, req.url);
    login.searchParams.set("redirect", pathname + search);

    return NextResponse.redirect(login, { headers: res.headers });
  }

  if (isPortal) {
    const mode = await resolvePortalModeServer(supabase, user.id);

    const isFleetPortalPath =
      pathname === "/portal/fleet" || pathname.startsWith("/portal/fleet/");

    if (mode === "fleet" && !isFleetPortalPath) {
      const target = new URL("/portal/fleet", req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }

    if (mode === "customer" && isFleetPortalPath) {
      const target = new URL("/portal", req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }
  }

  if (!isPortal && !completed && !pathname.startsWith("/onboarding")) {
    const target = new URL("/onboarding", req.url);
    return NextResponse.redirect(target, { headers: res.headers });
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
    "/forgot-password",
    "/auth/reset",
    "/auth/set-password",
    "/demo/:path*",
    "/portal/:path*",
    "/mobile/sign-in",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/fleet/:path*",
    "/work-orders/:path*",
    "/inspections/:path*",
    "/mobile/:path*",
    "/parts/:path*",
    "/tech/queue",
  ],
};
