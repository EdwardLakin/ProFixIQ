import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
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

function isMobileDeviceRequest(req: NextRequest): boolean {
  const clientHint = req.headers.get("sec-ch-ua-mobile");
  if (clientHint === "?1") return true;

  const userAgent = req.headers.get("user-agent") ?? "";
  return /android|iphone|ipad|ipod|mobile|windows phone/i.test(userAgent);
}

function safeRedirectPath(v: string | null): string | null {
  if (!v) return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}

type PortalAccess = {
  customer: boolean;
  fleet: boolean;
};

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

async function resolvePortalAccessServer(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PortalAccess> {
  let customer = false;
  let fleet = false;

  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    customer = Boolean(cust?.id);
  } catch {
    // ignore
  }

  try {
    const actor = await resolveFleetActorContext(supabase, { userId });
    fleet = actor.capabilities.canAccessPortalFleetWrappers;
  } catch {
    // ignore
  }

  return { customer, fleet };
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const mobileDeviceRequest = isMobileDeviceRequest(req);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-next-pathname", pathname);

  if (isAssetPath(pathname) || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  const isPortalAuthPage = pathname.startsWith("/portal/auth/");
  const isPortalActivationPage =
    pathname === "/portal/auth/confirm" ||
    pathname === "/portal/auth/fleet-invite";
  const isLegacyPortalConfirm =
    pathname === "/portal/confirm" ||
    pathname === "/portal/confirm/" ||
    pathname.startsWith("/portal/confirm");
  const isPublicPortalEnrollment = pathname.startsWith("/portal/join/");

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
    isLegacyPortalConfirm ||
    isPublicPortalEnrollment;

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
  let canUseMobile = false;
  const isPortalOnlyAccount =
    user?.app_metadata?.profixiq_portal_only === true;

  if (user && !isPortal) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("completed_onboarding, shop_id, role")
        .eq("id", user.id)
        .limit(1)
        .maybeSingle();

      completed = !!profile?.completed_onboarding || !!profile?.shop_id;
      const capabilities = getActorCapabilities({ role: profile?.role });
      canUseMobile =
        capabilities.isKnownRole && capabilities.canonicalRole !== "customer";

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
    } catch {
      completed = false;
      needsShopBoostIntake = false;
      canUseMobile = false;
    }
  }

  if (pathname === "/" && user) {
    if (isPortalOnlyAccount) {
      const access = await resolvePortalAccessServer(supabase, user.id);
      const target = new URL(
        access.fleet && !access.customer ? "/portal/fleet" : "/portal",
        req.url,
      );
      return NextResponse.redirect(target, { headers: res.headers });
    }
    const target = new URL(
      !completed
        ? "/onboarding"
        : needsShopBoostIntake
          ? "/onboarding/shop-boost"
          : mobileDeviceRequest
            ? "/mobile"
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
      if (isPortalOnlyAccount) {
        const access = await resolvePortalAccessServer(supabase, user.id);
        const target = new URL(
          access.fleet && !access.customer ? "/portal/fleet" : "/portal",
          req.url,
        );
        return NextResponse.redirect(target, { headers: res.headers });
      }

      const defaultAuthenticatedPath = !completed
        ? "/onboarding"
        : needsShopBoostIntake
          ? "/onboarding/shop-boost"
          : isMobileSignIn || mobileDeviceRequest
            ? "/mobile"
            : "/dashboard";
      const to = redirectParam ?? defaultAuthenticatedPath;
      const target = new URL(to, req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }

    if (
      isPortal &&
      user &&
      (isPortalAuthPage || isLegacyPortalConfirm) &&
      !isPortalActivationPage
    ) {
      const access = await resolvePortalAccessServer(supabase, user.id);
      const requestedFleet = redirectParam?.startsWith("/portal/fleet") ?? false;
      let to =
        redirectParam ??
        (access.fleet && !access.customer ? "/portal/fleet" : "/portal");

      if (requestedFleet && !access.fleet) to = "/portal";
      if (!requestedFleet && !access.customer && access.fleet) {
        to = "/portal/fleet";
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

  if (isPortalOnlyAccount && !isPortal) {
    const access = await resolvePortalAccessServer(supabase, user.id);
    const target = new URL(
      access.fleet && !access.customer ? "/portal/fleet" : "/portal",
      req.url,
    );
    return NextResponse.redirect(target, { headers: res.headers });
  }

  if (
    mobileDeviceRequest &&
    completed &&
    !needsShopBoostIntake &&
    !isPortal &&
    !pathname.startsWith("/mobile")
  ) {
    const requestedHref = `${pathname}${search}`;
    const mobileHref = resolveMobileHref(requestedHref);
    if (mobileHref && mobileHref !== requestedHref) {
      const target = new URL(mobileHref, req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }
  }

  if (pathname.startsWith("/mobile") && !canUseMobile) {
    if (!completed) {
      const target = new URL("/onboarding", req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }

    // Keep completed but unsupported/legacy roles inside the mobile surface.
    // `/mobile` renders the role-not-configured state without exposing desktop.
    if (pathname !== "/mobile") {
      const target = new URL("/mobile", req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }
    return res;
  }

  if (isPortal) {
    const access = await resolvePortalAccessServer(supabase, user.id);
    const isFleetPortalPath =
      pathname === "/portal/fleet" || pathname.startsWith("/portal/fleet/");

    if (!access.customer && access.fleet && !isFleetPortalPath) {
      const target = new URL("/portal/fleet", req.url);
      return NextResponse.redirect(target, { headers: res.headers });
    }

    if (!access.fleet && isFleetPortalPath) {
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
    "/sign-in",
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
    "/launch",
    "/offline/:path*",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/fleet/:path*",
    "/work-orders/:path*",
    "/quote-review/:path*",
    "/inspections/:path*",
    "/mobile/:path*",
    "/parts/:path*",
    "/tech/queue",
  ],
};
