import { describe, expect, it } from "vitest";
import {
  isFleetProductHostname,
  isFleetProductSharedPath,
  normalizeRequestHostname,
  toFleetInternalHref,
  toFleetInternalPath,
  toFleetPublicHref,
  toFleetPublicPath,
} from "@/features/fleet/lib/fleetProductRouting";

describe("Fleet product domain routing", () => {
  it("recognizes the production and local Fleet hosts without trusting lookalikes", () => {
    expect(isFleetProductHostname("fleet.profixiq.com")).toBe(true);
    expect(isFleetProductHostname("fleet.profixiq.com:443")).toBe(true);
    expect(isFleetProductHostname("fleet.localhost:3000")).toBe(true);
    expect(isFleetProductHostname("Fleet.ProFixIQ.com, proxy.internal")).toBe(true);
    expect(isFleetProductHostname("fleet.profixiq.com.attacker.test")).toBe(false);
    expect(isFleetProductHostname("profixiq.com")).toBe(false);
    expect(normalizeRequestHostname("[::1]:3000")).toBe("[::1]");
  });

  it.each([
    ["/", "/portal/fleet"],
    ["/assets", "/portal/fleet/units"],
    ["/assets/unit-42", "/portal/fleet/units/unit-42"],
    ["/drivers", "/portal/fleet/drivers"],
    ["/pre-trips", "/portal/fleet/pretrip-history"],
    ["/pre-trips/start/unit-42", "/portal/fleet/pretrip/unit-42"],
    ["/maintenance", "/portal/fleet/maintenance"],
    ["/calendar", "/portal/fleet/calendar"],
    ["/requests", "/portal/fleet/service-requests"],
    ["/requests/new", "/portal/fleet/request/build"],
    ["/history", "/portal/fleet/billing"],
    ["/reports", "/portal/fleet/reports"],
    ["/settings", "/portal/fleet/settings"],
    ["/sign-in", "/portal/auth/fleet-sign-in"],
  ])("maps the public route %s to the canonical route and back", (publicPath, internalPath) => {
    expect(toFleetInternalPath(publicPath)).toBe(internalPath);
    expect(toFleetPublicPath(internalPath)).toBe(publicPath);
  });

  it("preserves query strings and fragments for deep-link authentication", () => {
    expect(toFleetInternalHref("/assets/unit-42?tab=history#invoice")).toBe(
      "/portal/fleet/units/unit-42?tab=history#invoice",
    );
    expect(
      toFleetPublicHref(
        "/portal/fleet/request/build?unitId=unit-42&source=pretrip",
      ),
    ).toBe("/requests/new?unitId=unit-42&source=pretrip");
  });

  it("does not map unknown, unsafe, or similarly prefixed routes", () => {
    expect(toFleetInternalPath("/assets-private")).toBeNull();
    expect(toFleetInternalPath("/dashboard")).toBeNull();
    expect(toFleetPublicPath("/portal/fleetish")).toBeNull();
    expect(toFleetInternalHref("https://attacker.test/assets")).toBeNull();
    expect(toFleetInternalHref("//attacker.test/assets")).toBeNull();
  });

  it("only passes shared API and account-recovery paths through the Fleet host", () => {
    expect(isFleetProductSharedPath("/api/portal/fleet/units")).toBe(true);
    expect(isFleetProductSharedPath("/forgot-password")).toBe(true);
    expect(isFleetProductSharedPath("/auth/reset")).toBe(true);
    expect(isFleetProductSharedPath("/portal")).toBe(false);
    expect(isFleetProductSharedPath("/dashboard")).toBe(false);
  });
});
