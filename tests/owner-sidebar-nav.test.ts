import { describe, expect, it } from "vitest";

import { TILES, type Role } from "@/features/shared/config/tiles";
import {
  OWNER_GROUP_ORDER,
  getOwnerSidebarTiles,
} from "@/features/shared/lib/ownerSidebarNav";

function ownerTiles() {
  const base = TILES.filter((tile) => tile.roles.includes("owner"));
  return getOwnerSidebarTiles(base);
}

describe("owner sidebar IA", () => {
  it("keeps owner route coverage intact while reorganizing labels/sections", () => {
    const base = TILES.filter((tile) => tile.roles.includes("owner"));
    const reorganized = getOwnerSidebarTiles(base);

    expect(new Set(reorganized.map((tile) => tile.href))).toEqual(
      new Set(base.map((tile) => tile.href)),
    );
  });

  it("uses the owner section order with dashboard first and technician tools near the bottom", () => {
    expect(OWNER_GROUP_ORDER[0]).toBe("Dashboard");
    expect(OWNER_GROUP_ORDER.at(-2)).toBe("Technician Tools");
  });

  it("keeps customer billing separate from plan billing", () => {
    const tiles = ownerTiles();
    const customerBilling = tiles.find((tile) => tile.href === "/billing");
    const planBilling = tiles.find((tile) => tile.href === "/compare-plans");

    expect(customerBilling?.title).toBe("Customer Billing");
    expect(customerBilling?.section).toBe("Operations");
    expect(planBilling?.title).toBe("Plan & Billing");
    expect(planBilling?.section).toBe("Billing & Plan");
  });

  it("groups inspection and menu builder routes together", () => {
    const tiles = ownerTiles();
    const groupedHrefs = [
      "/menu",
      "/inspections/custom-inspection",
      "/inspections/templates",
      "/inspections/fleet-import",
      "/inspections/saved",
    ];

    for (const href of groupedHrefs) {
      expect(tiles.find((tile) => tile.href === href)?.section).toBe(
        "Inspections & Menu",
      );
    }
  });


  it("does not remove expected primary routes for tech/admin/parts roles", () => {
    const roleToHrefs: Record<Role, string[]> = {
      mechanic: ["/dashboard", "/tech/queue"],
      admin: ["/dashboard/workforce", "/compare-plans"],
      parts: ["/parts", "/parts/requests"],
      advisor: [],
      dispatcher: [],
      driver: [],
      fleet_manager: [],
      lead_hand: [],
      foreman: [],
      manager: [],
      owner: [],
    };

    for (const [role, hrefs] of Object.entries(roleToHrefs)) {
      const roleTiles = TILES.filter((tile) => tile.roles.includes(role as Role));
      for (const href of hrefs) {
        expect(roleTiles.some((tile) => tile.href === href)).toBe(true);
      }
    }
  });
});
