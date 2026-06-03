import { describe, expect, it } from "vitest";
import {
  buildShopUserAuthEmail,
  buildShopUsernameNamespace,
  normalizeAuthIdentifier,
  normalizeLoginUsername,
  normalizeProvisioningUsername,
} from "../features/users/lib/username";

describe("shop user auth normalization", () => {
  it("uses the same synthetic auth email for created usernames and username sign-in", () => {
    const namespace = buildShopUsernameNamespace("Downtown Diesel");
    const username = normalizeProvisioningUsername(" Sam Tech ", namespace);

    expect(username).toBe("downtowndiessamtech");
    expect(buildShopUserAuthEmail(username)).toBe("downtowndiessamtech@local.profix-internal");
    expect(normalizeAuthIdentifier(username)).toBe(
      "downtowndiessamtech@local.profix-internal",
    );
  });

  it("normalizes username-only login exactly like backing auth email creation", () => {
    expect(normalizeLoginUsername(" Shop.User-01 ")).toBe("shopuser01");
    expect(normalizeAuthIdentifier(" Shop.User-01 ")).toBe("shopuser01@local.profix-internal");
  });

  it("preserves explicit email login as lower-case email auth", () => {
    expect(normalizeAuthIdentifier(" Person@Example.COM ")).toBe("person@example.com");
  });
});
