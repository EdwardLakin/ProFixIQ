import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import {
  isPortalPathForSurface,
  PORTAL_HOME,
  PORTAL_SIGN_IN,
  type PortalSurface,
} from "@/features/auth/lib/portalSurfaceRouting";
import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import {
  FLEET_PRODUCT_ORIGIN,
  isFleetProductHostname,
  isFleetProductSharedPath,
  toFleetInternalHref,
  toFleetInternalPath,
  toFleetPublicHref,
  toFleetPublicPath,
  resolveLegacyFleetRedirect,
} from "@/features/fleet/lib/fleetProductRouting";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  hasSupabasePublicEnv,
  readSupabasePublicEnv,
} from "@/features/shared/lib/supabase/public-env";

function isStaticAssetPath(p: string) {
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/fonts/") ||
    p.startsWith("/icons/") ||
    p.startsWith("/pwa-icons/") ||
    p.startsWith("/voice/") ||
    p === "/favicon.ico" ||
    p === "/carbon-weave.png" ||
    p === "/BlackOpsOne-Regular.ttf"
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

function requestHostname(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.hostname
  );
}

function isOpsHostname(hostname: string): boolean {
  const normalized = hostname.split(":")[0]?.toLowerCase();
  return normalized === "ops.profixiq.com" || normalized === "ops.localhost";
}

function productRequestUrl(
  req: NextRequest,
  path: string,
  fleetProductRequest: boolean,
): URL {
  const target = new URL(path, req.url);
  if (fleetProductRequest) {
    const publicPath = toFleetPublicPath(target.pathname);
    if (publicPath) target.pathname = publicPath;
  }
  return target;
}

function redirectWithResponseHeaders(
  target: URL,
  response: NextResponse,
): NextResponse {
  const headers = new Headers(response.headers);
  for (const header of Array.from(headers.keys())) {
    if (
      header === "x-middleware-next" ||
      header === "x-middleware-rewrite" ||
      header === "x-middleware-override-headers" ||
      header.startsWith("x-middleware-request-")
    ) {
      headers.delete(header);
    }
  }
  return NextResponse.redirect(target, { headers });
}

type PortalAccess = {
  customer: boolean;
  fleet: boolean;
};

type MiddlewareResponseState = {
  current: NextResponse;
};

function createMiddlewareSupabase(
  req: NextRequest,
  responseState: MiddlewareResponseState,
  rebuildResponse: () => NextResponse,
) {
  const { supabaseUrl, supabaseAnonKey } = readSupabasePublicEnv("middleware");
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          req.cookies.set(name, value);
        });

        const nextResponse = rebuildResponse();
        responseState.current.cookies
          .getAll()
          .forEach((cookie) => nextResponse.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => {
          nextResponse.cookies.set(name, value, options);
        });
        responseState.current = nextResponse;
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
  const requestPathname = req.nextUrl.pathname;
  const { search } = req.nextUrl;
  const hostname = requestHostname(req);
  const fleetProductRequest = isFleetProductHostname(hostname);
  const opsProductRequest = isOpsHostname(hostname);
  const mobileDeviceRequest = isMobileDeviceRequest(req);

  if (isStaticAssetPath(requestPathname)) {
    return NextResponse.next();
  }

  const requestedPublicRedirect = safeRedirectPath(
    req.nextUrl.searchParams.get("redirect"),
  );
  if (
    !fleetProductRequest &&
    requestPathname === "/mobile/sign-in" &&
    (requestedPublicRedirect === "/mobile/service" ||
      requestedPublicRedirect?.startsWith("/mobile/service/"))
  ) {
    const target = req.nextUrl.clone();
    target.pathname = "/field/sign-in";
    return NextResponse.redirect(target, 308);
  }

  if (!fleetProductRequest) {
    const legacyFleetRedirect = resolveLegacyFleetRedirect(
      `${requestPathname}${search}`,
    );
    if (legacyFleetRedirect) {
      const target = new URL(
        legacyFleetRedirect.href,
        legacyFleetRedirect.destination === "fleet"
          ? FLEET_PRODUCT_ORIGIN
          : req.url,
      );
      return NextResponse.redirect(target, 308);
    }
  }

  if (!fleetProductRequest) {
    const publicFleetPath = toFleetPublicPath(requestPathname);
    const isLegacyFleetWorkspace =
      requestPathname === "/portal/fleet" ||
      requestPathname.startsWith("/portal/fleet/");
    const isLegacyFleetSignIn = requestPathname === PORTAL_SIGN_IN.fleet;

    if (publicFleetPath || isLegacyFleetWorkspace || isLegacyFleetSignIn) {
      const target = new URL(
        isLegacyFleetSignIn ? "/sign-in" : (publicFleetPath ?? "/"),
        FLEET_PRODUCT_ORIGIN,
      );
      target.search = search;
      return NextResponse.redirect(target, 308);
    }
  }

  if (fleetProductRequest) {
    const canonicalPublicPath = toFleetPublicPath(requestPathname);
    if (canonicalPublicPath && canonicalPublicPath !== requestPathname) {
      const target = req.nextUrl.clone();
      target.pathname = canonicalPublicPath;
      return NextResponse.redirect(target, 308);
    }
  }

  const fleetInternalPath = fleetProductRequest
    ? toFleetInternalPath(requestPathname)
    : null;

  if (
    fleetProductRequest &&
    !fleetInternalPath &&
    !isFleetProductSharedPath(requestPathname)
  ) {
    const target = req.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    return NextResponse.redirect(target);
  }

  const opsInternalPath =
    opsProductRequest &&
    (requestPathname === "/" ||
      requestPathname === "/ops" ||
      requestPathname === "/ops/")
      ? "/ops"
      : null;

  const pathname = opsInternalPath ?? fleetInternalPath ?? requestPathname;
  const isGuidedOnboardingPath =
    pathname === "/dashboard/onboarding-v2" ||
    pathname.startsWith("/dashboard/onboarding-v2/");
  if (
    pathname === "/portal/fleet/auth/sign-in" ||
    pathname === "/portal/fleet/auth/sign-in/"
  ) {
    const target = productRequestUrl(
      req,
      PORTAL_SIGN_IN.fleet,
      fleetProductRequest,
    );
    return NextResponse.redirect(target, 308);
  }

  const fleetRewriteTarget = req.nextUrl.clone();
  if (fleetInternalPath) fleetRewriteTarget.pathname = fleetInternalPath;
  if (opsInternalPath) fleetRewriteTarget.pathname = opsInternalPath;

  const rebuildResponse = () => {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-next-pathname", pathname);
    if (fleetProductRequest) {
      requestHeaders.set("x-profixiq-product-host", "fleet");
    } else if (opsProductRequest) {
      requestHeaders.set("x-profixiq-product-host", "ops");
    }

    return fleetInternalPath || opsInternalPath
      ? NextResponse.rewrite(fleetRewriteTarget, {
          request: { headers: requestHeaders },
        })
      : NextResponse.next({ request: { headers: requestHeaders } });
  };
  const responseState: MiddlewareResponseState = {
    current: rebuildResponse(),
  };

  if (pathname.startsWith("/api")) {
    if (!hasSupabasePublicEnv()) return responseState.current;
    const supabase = createMiddlewareSupabase(
      req,
      responseState,
      rebuildResponse,
    );
    await supabase.auth.getUser();
    return responseState.current;
  }

  const isPortal = pathname === "/portal" || pathname.startsWith("/portal/");
  const isFleetPortalAuthPage = pathname === PORTAL_SIGN_IN.fleet;
  const isPortalAuthPage = pathname.startsWith("/portal/auth/");
  const isAccessChooser = pathname === "/sign-in";
  const isShopSignIn =
    pathname === "/shop/sign-in" || pathname.startsWith("/signup");
  const isFieldSignIn = pathname === "/field/sign-in";
  const isCustomerSignIn = pathname === PORTAL_SIGN_IN.customer;
  const isMobileSignIn = pathname === "/mobile/sign-in";
  const isLegacyCustomerSignIn = pathname === "/portal/auth/sign-in";
  const isFleetPortalPath = isPortalPathForSurface(pathname, "fleet");
  const isPortalActivationPage =
    pathname === "/portal/auth/confirm" ||
    pathname === "/portal/auth/fleet-invite";
  const isLegacyPortalConfirm =
    pathname === "/portal/confirm" ||
    pathname === "/portal/confirm/" ||
    pathname.startsWith("/portal/confirm");
  const isPublicPortalEnrollment = pathname.startsWith("/portal/join/");
  const isPublicFleetMetadata =
    fleetProductRequest &&
    (pathname === "/fleet-manifest.webmanifest" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml");

  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/signup") ||
    isAccessChooser ||
    isShopSignIn ||
    isFieldSignIn ||
    isCustomerSignIn ||
    isMobileSignIn ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/reset") ||
    pathname.startsWith("/auth/set-password") ||
    pathname.startsWith("/demo") ||
    isPublicFleetMetadata ||
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
    return responseState.current;
  }

  const supabase = createMiddlewareSupabase(
    req,
    responseState,
    rebuildResponse,
  );
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
  let canUseMobile = false;
  const isPortalOnlyAccount = user?.app_metadata?.profixiq_portal_only === true;

  if (user && !isPortal) {
    try {
      const { profile } = await resolveCanonicalStaffProfile(supabase, user.id);

      const normalizedRole = String(profile?.role ?? "")
        .trim()
        .toLowerCase();
      const pendingOwnerBootstrap =
        normalizedRole === "owner" &&
        Boolean(profile?.shop_id) &&
        !profile?.completed_onboarding;
      completed = pendingOwnerBootstrap
        ? false
        : Boolean(profile?.completed_onboarding || profile?.shop_id);
      const capabilities = getActorCapabilities({ role: profile?.role });
      canUseMobile =
        capabilities.isKnownRole && capabilities.canonicalRole !== "customer";
    } catch {
      completed = false;
      canUseMobile = false;
    }
  }

  if (isPublic) {
    const requestedRedirect = safeRedirectPath(
      req.nextUrl.searchParams.get("redirect"),
    );
    const redirectParam = fleetProductRequest
      ? (toFleetInternalHref(requestedRedirect) ?? requestedRedirect)
      : requestedRedirect;

    if (user && (isShopSignIn || isMobileSignIn || isFieldSignIn)) {
      if (isPortalOnlyAccount) {
        const access = await resolvePortalAccessServer(supabase, user.id);
        const target = productRequestUrl(
          req,
          access.fleet && !access.customer ? "/portal/fleet" : "/portal",
          fleetProductRequest,
        );
        return redirectWithResponseHeaders(target, responseState.current);
      }

      if (isFieldSignIn) {
        if (!completed) {
          const target = productRequestUrl(
            req,
            "/onboarding",
            fleetProductRequest,
          );
          return redirectWithResponseHeaders(target, responseState.current);
        }
        return responseState.current;
      }

      const defaultAuthenticatedPath = !completed
        ? "/onboarding"
        : isMobileSignIn
          ? "/mobile"
          : "/dashboard";
      const to = redirectParam ?? defaultAuthenticatedPath;
      const target = productRequestUrl(req, to, fleetProductRequest);
      return redirectWithResponseHeaders(target, responseState.current);
    }

    if (user && isCustomerSignIn) {
      const access = await resolvePortalAccessServer(supabase, user.id);
      if (!access.customer && !access.fleet) return responseState.current;

      const surface: PortalSurface = access.customer ? "customer" : "fleet";
      const to = isPortalPathForSurface(redirectParam, surface)
        ? redirectParam!
        : PORTAL_HOME[surface];
      const target = productRequestUrl(req, to, fleetProductRequest);
      return redirectWithResponseHeaders(target, responseState.current);
    }

    if (fleetProductRequest && isFleetPortalAuthPage && user) {
      const access = await resolvePortalAccessServer(supabase, user.id);
      if (!access.fleet) return responseState.current;

      const target = productRequestUrl(
        req,
        isPortalPathForSurface(redirectParam, "fleet")
          ? redirectParam!
          : "/portal/fleet",
        true,
      );
      return redirectWithResponseHeaders(target, responseState.current);
    }

    if (
      isPortal &&
      user &&
      (isPortalAuthPage || isLegacyPortalConfirm) &&
      !isPortalActivationPage
    ) {
      const access = await resolvePortalAccessServer(supabase, user.id);
      const requestedSurface: PortalSurface =
        isFleetPortalAuthPage ||
        req.nextUrl.searchParams.get("portal") === "fleet" ||
        isPortalPathForSurface(redirectParam, "fleet")
          ? "fleet"
          : "customer";
      const hasRequestedAccess =
        requestedSurface === "fleet" ? access.fleet : access.customer;
      const otherSurface: PortalSurface =
        requestedSurface === "fleet" ? "customer" : "fleet";
      const hasOtherAccess =
        otherSurface === "fleet" ? access.fleet : access.customer;
      const surface = hasRequestedAccess
        ? requestedSurface
        : hasOtherAccess
          ? otherSurface
          : requestedSurface;
      const to = isPortalPathForSurface(redirectParam, surface)
        ? redirectParam!
        : PORTAL_HOME[surface];

      const target = productRequestUrl(req, to, fleetProductRequest);
      return redirectWithResponseHeaders(target, responseState.current);
    }

    if (
      !user &&
      (isCustomerSignIn || isLegacyCustomerSignIn) &&
      req.nextUrl.searchParams.get("portal") === "fleet"
    ) {
      const login = productRequestUrl(
        req,
        PORTAL_SIGN_IN.fleet,
        fleetProductRequest,
      );
      if (isPortalPathForSurface(redirectParam, "fleet")) {
        login.searchParams.set(
          "redirect",
          fleetProductRequest
            ? (toFleetPublicHref(redirectParam) ?? redirectParam!)
            : redirectParam!,
        );
      }
      return redirectWithResponseHeaders(login, responseState.current);
    }

    return responseState.current;
  }

  if (!user) {
    if (isPortal) {
      const surface: PortalSurface = isFleetPortalPath ? "fleet" : "customer";
      const login = productRequestUrl(
        req,
        PORTAL_SIGN_IN[surface],
        fleetProductRequest,
      );
      login.searchParams.set(
        "redirect",
        fleetProductRequest ? requestPathname + search : pathname + search,
      );
      return redirectWithResponseHeaders(login, responseState.current);
    }

    const isFieldRoute =
      pathname === "/mobile/service" || pathname.startsWith("/mobile/service/");
    const isMobileRoute = pathname.startsWith("/mobile");
    const loginPath = isFieldRoute
      ? "/field/sign-in"
      : isMobileRoute
        ? "/mobile/sign-in"
        : "/shop/sign-in";
    const login = productRequestUrl(req, loginPath, fleetProductRequest);
    login.searchParams.set("redirect", pathname + search);
    return redirectWithResponseHeaders(login, responseState.current);
  }

  if (isPortalOnlyAccount && !isPortal) {
    const access = await resolvePortalAccessServer(supabase, user.id);
    const target = productRequestUrl(
      req,
      access.fleet && !access.customer ? "/portal/fleet" : "/portal",
      fleetProductRequest,
    );
    return redirectWithResponseHeaders(target, responseState.current);
  }

  if (
    mobileDeviceRequest &&
    completed &&
    !isPortal &&
    !isGuidedOnboardingPath &&
    !pathname.startsWith("/mobile")
  ) {
    const requestedHref = `${pathname}${search}`;
    const mobileHref = resolveMobileHref(requestedHref);
    if (mobileHref && mobileHref !== requestedHref) {
      const target = productRequestUrl(req, mobileHref, fleetProductRequest);
      return redirectWithResponseHeaders(target, responseState.current);
    }
  }

  if (pathname.startsWith("/mobile") && !canUseMobile) {
    if (!completed) {
      const target = productRequestUrl(req, "/onboarding", fleetProductRequest);
      return redirectWithResponseHeaders(target, responseState.current);
    }

    // Keep completed but unsupported/legacy roles inside the mobile surface.
    // `/mobile` renders the role-not-configured state without exposing desktop.
    if (pathname !== "/mobile") {
      const target = productRequestUrl(req, "/mobile", fleetProductRequest);
      return redirectWithResponseHeaders(target, responseState.current);
    }
    return responseState.current;
  }

  if (isPortal) {
    const access = await resolvePortalAccessServer(supabase, user.id);

    if (!access.customer && access.fleet && !isFleetPortalPath) {
      const target = productRequestUrl(
        req,
        "/portal/fleet",
        fleetProductRequest,
      );
      return redirectWithResponseHeaders(target, responseState.current);
    }

    if (!access.fleet && isFleetPortalPath) {
      const target = productRequestUrl(
        req,
        fleetProductRequest
          ? "/portal/auth/fleet-sign-in?access=required"
          : "/portal",
        fleetProductRequest,
      );
      return redirectWithResponseHeaders(target, responseState.current);
    }
  }

  if (!isPortal && !completed && !pathname.startsWith("/onboarding")) {
    const target = productRequestUrl(req, "/onboarding", fleetProductRequest);
    return redirectWithResponseHeaders(target, responseState.current);
  }

  return responseState.current;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "host", value: "fleet.profixiq.com" }],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "host", value: "fleet.localhost" }],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "host", value: "ops.profixiq.com" }],
    },
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "host", value: "ops.localhost" }],
    },
    "/",
    "/sign-in",
    "/shop/sign-in",
    "/field/sign-in",
    "/customer/sign-in",
    "/compare-plans",
    "/subscribe",
    "/confirm",
    "/signup",
    "/forgot-password",
    "/auth/reset",
    "/auth/set-password",
    "/demo/:path*",
    "/portal/:path*",
    "/assets/:path*",
    "/drivers/:path*",
    "/pre-trips/:path*",
    "/maintenance/:path*",
    "/calendar/:path*",
    "/requests/:path*",
    "/history/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/mobile/sign-in",
    "/launch",
    "/offline/:path*",
    "/onboarding/:path*",
    "/ops/:path*",
    "/dashboard/:path*",
    "/fleet/:path*",
    "/work-orders/:path*",
    "/quote-review/:path*",
    "/inspections/:path*",
    "/mobile/:path*",
    "/parts/:path*",
    "/api/:path*",
    "/tech/queue",
  ],
};
