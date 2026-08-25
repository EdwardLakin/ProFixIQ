import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config } from "../middleware";

type MiddlewareTestConfig = Parameters<
  typeof unstable_doesMiddlewareMatch
>[0]["config"];

function matchesShopRoute(pathname: string): boolean {
  return unstable_doesMiddlewareMatch({
    config: config as MiddlewareTestConfig,
    url: `https://profixiq.com${pathname}`,
    headers: { host: "profixiq.com" },
  });
}

describe("protected Shop middleware matcher", () => {
  it.each([
    "/agent",
    "/agent/planner",
    "/ai/assistant",
    "/assistant",
    "/billing",
    "/chat",
    "/chat/conversation-1",
    "/copilot/technician",
    "/customers",
    "/customers/search",
    "/estimates",
    "/estimates/new",
    "/inspection-reports/inspection-1",
    "/inspection_template_suggestions",
    "/menu",
    "/menu/item/menu-item-1",
    "/menu_item_suggestions",
    "/tech/performance",
    "/vehicles",
    "/vehicles/vehicle-1",
  ])("runs the authentication boundary for %s", (pathname) => {
    expect(matchesShopRoute(pathname)).toBe(true);
  });

  it.each([
    "/field-service",
    "/fleet-maintenance",
    "/auth/callback",
    "/pay/success",
    "/customers-list/customer-1",
    "/tech/performance-extra",
  ])("does not broaden Shop middleware onto %s", (pathname) => {
    expect(matchesShopRoute(pathname)).toBe(false);
  });
});
