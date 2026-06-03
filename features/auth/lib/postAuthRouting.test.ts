import { describe, expect, it } from "vitest";
import {
  ONBOARDING_V2_PATH,
  SHOP_ASSIGNMENT_REQUIRED_PATH,
  resolvePostAuthDecision,
} from "./postAuthRouting";

describe("resolvePostAuthDecision", () => {
  it("routes an owner with no shop to onboarding v2", () => {
    expect(
      resolvePostAuthDecision({
        isAuthenticated: true,
        profile: { role: "owner", shop_id: null },
      }),
    ).toBe(ONBOARDING_V2_PATH);
  });

  it("routes staff with no shop to shop assignment required", () => {
    expect(
      resolvePostAuthDecision({
        isAuthenticated: true,
        profile: { role: "advisor", shop_id: null },
      }),
    ).toBe(SHOP_ASSIGNMENT_REQUIRED_PATH);
  });

  it("routes a user with a shop to the dashboard", () => {
    expect(
      resolvePostAuthDecision({
        isAuthenticated: true,
        profile: { role: "mechanic", shop_id: "shop-1" },
      }),
    ).toBe("/dashboard");
  });

  it("leaves signed-out public-route handling to middleware by returning sign-in only for protected decisions", () => {
    expect(
      resolvePostAuthDecision({
        isAuthenticated: false,
        profile: null,
      }),
    ).toBe("/sign-in");
  });
});
