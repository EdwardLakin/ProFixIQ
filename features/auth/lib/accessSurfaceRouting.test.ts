import { describe, expect, it } from "vitest";

import {
  PRODUCT_SIGN_IN,
  resolveLegacySignInHref,
} from "./accessSurfaceRouting";

describe("product access surface routing", () => {
  it("keeps plain sign-in as the neutral app chooser", () => {
    expect(resolveLegacySignInHref(new URLSearchParams())).toBeNull();
  });

  it("preserves Shop acquisition and protected-route continuations", () => {
    const acquisition = resolveLegacySignInHref(
      new URLSearchParams("flow=acquisition&session_id=cs_test_123"),
    );
    const protectedRoute = resolveLegacySignInHref(
      new URLSearchParams("redirect=%2Fwork-orders%2Fwo-1"),
    );

    expect(acquisition).toBe(
      "/shop/sign-in?session_id=cs_test_123&flow=acquisition",
    );
    expect(protectedRoute).toBe(
      "/shop/sign-in?redirect=%2Fwork-orders%2Fwo-1",
    );
  });

  it("routes legacy continuations to Field, Fleet, and Customer Portal", () => {
    expect(
      resolveLegacySignInHref(
        new URLSearchParams("redirect=%2Fmobile%2Fservice%2Ftoday"),
      ),
    ).toBe("/field/sign-in?redirect=%2Fmobile%2Fservice%2Ftoday");

    expect(
      resolveLegacySignInHref(
        new URLSearchParams("redirect=%2Fportal%2Ffleet%2Fassets"),
      ),
    ).toBe(
      `${PRODUCT_SIGN_IN.fleet}?redirect=%2Fportal%2Ffleet%2Fassets`,
    );

    expect(
      resolveLegacySignInHref(
        new URLSearchParams("surface=customer&redirect=%2Fportal%2Finvoices"),
      ),
    ).toBe(
      "/customer/sign-in?redirect=%2Fportal%2Finvoices&surface=customer",
    );
  });

  it("does not classify an unsafe external redirect as another product", () => {
    expect(
      resolveLegacySignInHref(
        new URLSearchParams("redirect=https%3A%2F%2Fevil.example"),
      ),
    ).toBe("/shop/sign-in?redirect=https%3A%2F%2Fevil.example");
  });
});
