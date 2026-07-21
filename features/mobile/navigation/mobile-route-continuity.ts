const MOBILE_ORIGIN = "https://mobile.profixiq.local";

const NON_NAVIGATION_PROTOCOLS = [
  "mailto:",
  "tel:",
  "sms:",
  "javascript:",
] as const;

function withSuffix(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

function firstPathSegmentAfter(pathname: string, prefix: string): string | null {
  const remainder = pathname.slice(prefix.length).replace(/^\/+/, "");
  const segment = remainder.split("/")[0]?.trim();
  return segment || null;
}

function mapWorkOrderPath(pathname: string): string {
  if (pathname === "/work-orders" || pathname === "/work-orders/") {
    return "/mobile/work-orders";
  }
  if (pathname.startsWith("/work-orders/board")) return "/mobile/dispatch";
  if (
    pathname.startsWith("/work-orders/create") ||
    pathname.startsWith("/work-orders/new")
  ) {
    return "/mobile/work-orders/create";
  }

  const viewId = firstPathSegmentAfter(pathname, "/work-orders/view");
  if (viewId) return `/mobile/work-orders/${viewId}`;

  const workOrderId = firstPathSegmentAfter(pathname, "/work-orders");
  return workOrderId
    ? `/mobile/work-orders/${workOrderId}`
    : "/mobile/work-orders";
}

function mapQuoteReviewPath(pathname: string): string {
  const workOrderId = firstPathSegmentAfter(pathname, "/quote-review");
  return workOrderId
    ? `/mobile/work-orders/${workOrderId}`
    : "/mobile/work-orders";
}

function mapInspectionPath(pathname: string): string {
  if (pathname.startsWith("/inspections/fleet-import")) {
    return "/mobile/inspections/import";
  }
  if (pathname.startsWith("/inspections/fleet-review")) {
    return "/mobile/inspections/import";
  }
  if (pathname.startsWith("/inspections/maintenance-50-air")) {
    return "/mobile/inspections/maintenance-50-air";
  }
  if (pathname.startsWith("/inspections/maintenance-50")) {
    return "/mobile/inspections/maintenance-50";
  }

  const inspectionId = firstPathSegmentAfter(pathname, "/inspections");
  const nonRecordRoutes = new Set([
    "run",
    "fill",
    "templates",
    "builder",
    "maintenance",
  ]);

  return inspectionId && !nonRecordRoutes.has(inspectionId)
    ? `/mobile/inspections/${inspectionId}`
    : "/mobile/inspections";
}

function mapMessagePath(pathname: string): string {
  const suffix = pathname.slice("/messages".length);
  return `/mobile/messages${suffix}`;
}

function mapCustomerPath(pathname: string): string {
  const customerId = firstPathSegmentAfter(pathname, "/customers");
  return customerId ? `/mobile/customers/${customerId}` : "/mobile/work-orders";
}

function mapFleetPath(pathname: string): string {
  if (pathname.startsWith("/fleet/service-requests")) {
    return "/mobile/fleet/service-requests";
  }
  if (pathname.startsWith("/fleet/pretrip")) {
    const unitId = firstPathSegmentAfter(pathname, "/fleet/pretrip");
    return unitId
      ? `/mobile/fleet/pretrip/${unitId}`
      : "/mobile/fleet/pretrip";
  }
  if (pathname.startsWith("/fleet/assets")) {
    const unitId = firstPathSegmentAfter(pathname, "/fleet/assets");
    return unitId
      ? `/mobile/fleet?unit=${encodeURIComponent(unitId)}`
      : "/mobile/fleet";
  }
  return "/mobile/fleet";
}

function mapDashboardPath(pathname: string): string {
  if (pathname.startsWith("/dashboard/workforce")) {
    return "/mobile/workforce/attendance";
  }
  if (
    pathname.startsWith("/dashboard/admin/people") ||
    pathname.startsWith("/dashboard/admin/employees") ||
    pathname.startsWith("/dashboard/technicians")
  ) {
    return "/mobile/technicians";
  }
  if (pathname.startsWith("/dashboard/appointments")) {
    return "/mobile/appointments";
  }
  if (pathname.startsWith("/dashboard/reports")) {
    return "/mobile/reports";
  }
  return "/mobile";
}

/**
 * Resolves a known ProFixIQ application route to its mobile-native counterpart.
 * External URLs, hashes, API routes, portal routes, and shared auth routes return
 * null so the caller can leave them alone.
 */
export function resolveMobileHref(rawHref: string | null | undefined): string | null {
  const href = String(rawHref ?? "").trim();
  if (!href || href === "#") return null;
  if (
    NON_NAVIGATION_PROTOCOLS.some((protocol) =>
      href.toLowerCase().startsWith(protocol),
    )
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(href, MOBILE_ORIGIN);
  } catch {
    return null;
  }

  if (parsed.origin !== MOBILE_ORIGIN) return null;

  const { pathname, search, hash } = parsed;
  if (pathname.startsWith("/mobile")) {
    return withSuffix(pathname, search, hash);
  }

  let mobilePath: string | null = null;

  if (pathname === "/" || pathname.startsWith("/dashboard")) {
    mobilePath = pathname === "/" ? "/mobile" : mapDashboardPath(pathname);
  } else if (pathname.startsWith("/work-orders")) {
    mobilePath = mapWorkOrderPath(pathname);
  } else if (pathname.startsWith("/quote-review")) {
    mobilePath = mapQuoteReviewPath(pathname);
  } else if (pathname.startsWith("/billing")) {
    mobilePath = "/mobile/work-orders";
  } else if (pathname.startsWith("/tech/queue")) {
    mobilePath = "/mobile/tech/queue";
  } else if (pathname.startsWith("/tech/performance")) {
    mobilePath = "/mobile/tech/performance";
  } else if (pathname.startsWith("/appointments")) {
    mobilePath = "/mobile/appointments";
  } else if (pathname.startsWith("/inspections")) {
    mobilePath = mapInspectionPath(pathname);
  } else if (pathname.startsWith("/inspection_template_suggestions")) {
    mobilePath = "/mobile/inspections";
  } else if (pathname.startsWith("/parts")) {
    mobilePath = "/mobile/parts";
  } else if (pathname.startsWith("/messages")) {
    mobilePath = mapMessagePath(pathname);
  } else if (pathname.startsWith("/customers")) {
    mobilePath = mapCustomerPath(pathname);
  } else if (pathname.startsWith("/fleet")) {
    mobilePath = mapFleetPath(pathname);
  } else if (pathname.startsWith("/offline")) {
    mobilePath = "/mobile/offline";
  } else if (
    pathname.startsWith("/assistant") ||
    pathname.startsWith("/ai/assistant")
  ) {
    mobilePath = "/mobile/assistant";
  } else if (pathname.startsWith("/agent/planner")) {
    mobilePath = "/mobile/planner";
  } else if (pathname.startsWith("/settings")) {
    mobilePath = "/mobile/settings";
  } else if (
    pathname.startsWith("/reports") ||
    pathname.startsWith("/menu_item_suggestions") ||
    pathname.startsWith("/menu/item")
  ) {
    mobilePath = "/mobile/reports";
  } else if (pathname.startsWith("/technicians")) {
    mobilePath = "/mobile/technicians";
  } else if (pathname === "/sign-in") {
    mobilePath = "/mobile/sign-in";
  }

  if (!mobilePath) return null;

  // Some mobile mappings already include their own query string.
  if (mobilePath.includes("?")) {
    const [mappedPath, mappedQuery] = mobilePath.split("?", 2);
    const merged = new URLSearchParams(mappedQuery);
    parsed.searchParams.forEach((value, key) => merged.set(key, value));
    const query = merged.toString();
    return `${mappedPath}${query ? `?${query}` : ""}${hash}`;
  }

  return withSuffix(mobilePath, search, hash);
}

export function requireMobileHref(rawHref: string): string {
  return resolveMobileHref(rawHref) ?? "/mobile";
}
