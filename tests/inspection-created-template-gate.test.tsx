import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopPageAccess: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: mocks.requireShopPageAccess,
}));

vi.mock("@/features/inspections/app/inspection/created/page", () => ({
  default: () => null,
}));

import Page from "../app/inspections/created/page";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

describe("created inspection-template management route", () => {
  it("requires a server-authoritative billing-operator role before rendering", async () => {
    await Page();

    expect(mocks.requireShopPageAccess).toHaveBeenCalledOnce();
    expect(mocks.requireShopPageAccess).toHaveBeenCalledWith({
      allowRoles: ROLE_GROUPS.billingOperators,
      redirectTo: "/inspections/templates",
    });
  });
});
