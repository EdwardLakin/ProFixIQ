import { describe, expect, it } from "vitest";

import { buildFleetNotificationHref } from "@/features/fleet/lib/fleetNotificationRouting";

const FLEET_ID = "30000000-0000-4000-8000-00000000000a";

describe("Fleet alert navigation", () => {
  it("maps legacy Fleet alert links to the Fleet product root without losing query state", () => {
    expect(
      buildFleetNotificationHref({
        href: "/fleet?focus=defects",
        fleetId: FLEET_ID,
        routePrefix: "/fleet",
      }),
    ).toBe(`/?focus=defects&fleetId=${FLEET_ID}`);
  });

  it("maps the same alert to the portal route when rendered on the portal host", () => {
    expect(
      buildFleetNotificationHref({
        href: "/fleet?focus=defects",
        fleetId: FLEET_ID,
        routePrefix: "/portal/fleet",
      }),
    ).toBe(`/portal/fleet?focus=defects&fleetId=${FLEET_ID}`);
  });

  it("replaces rather than duplicates an existing fleet id", () => {
    expect(
      buildFleetNotificationHref({
        href: "/fleet?focus=defects&fleetId=old",
        fleetId: FLEET_ID,
        routePrefix: "/fleet",
      }),
    ).toBe(`/?focus=defects&fleetId=${FLEET_ID}`);
  });
});
