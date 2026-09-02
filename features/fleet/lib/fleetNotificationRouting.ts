import { resolveLegacyFleetRedirect } from "@/features/fleet/lib/fleetProductRouting";

type FleetNotificationRoutePrefix = "/fleet" | "/portal/fleet";

export function buildFleetNotificationHref({
  href,
  fleetId,
  routePrefix,
}: {
  href: string;
  fleetId?: string;
  routePrefix: FleetNotificationRoutePrefix;
}): string {
  let target = href;

  if (href.startsWith("/fleet")) {
    if (routePrefix === "/fleet") {
      const publicTarget = resolveLegacyFleetRedirect(href);
      target =
        publicTarget?.destination === "fleet" ? publicTarget.href : "/";
    } else {
      target = `${routePrefix}${href.slice("/fleet".length)}`;
    }
  }

  const parsed = new URL(target, "https://fleet-routing.invalid");
  if (fleetId) parsed.searchParams.set("fleetId", fleetId);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
