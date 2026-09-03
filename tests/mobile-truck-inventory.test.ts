import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const api = read("app/api/mobile/service-visits/truck-inventory/route.ts");
const page = read("app/mobile/parts/truck/page.tsx");
const partsPage = read("app/mobile/parts/page.tsx");
const fieldPage = read("app/mobile/service/truck-inventory/page.tsx");
const fieldShell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const ui = read("features/parts/mobile/MobileTruckInventory.tsx");
const mobileTiles = read("features/mobile/config/mobile-tiles.ts");

describe("Mobile assigned-truck inventory", () => {
  it("derives truck inventory from the authenticated Field Service assignment", () => {
    expect(api).toContain("requireMobileServiceOperatorApiAccess");
    expect(api).toContain("getMobileActiveJobs");
    expect(api).toContain("snapshot.activeJob ?? snapshot.nextJob");
    expect(api).toContain("visit?.serviceVehicle");
    expect(api).toContain("stockLocationId");
  });

  it("reads the canonical inventory availability projection without adding a second stock model", () => {
    expect(api).toContain('.from("v_part_stock")');
    expect(api).toContain("qty_available");
    expect(api).toContain("qty_on_hand");
    expect(api).toContain("qty_reserved");
    expect(api).toContain('.eq("location_id", stockLocationId)');
    expect(api).not.toContain('.from("part_stock")');
    expect(api).not.toContain('.from("stock_moves").insert');
  });

  it("keeps canonical part identity and explicit shop scoping", () => {
    expect(api).toContain('.from("parts")');
    expect(api).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(api).toContain("partId");
    expect(api).toContain("part_number");
  });

  it("exposes a touch-friendly Field Service truck stock surface", () => {
    expect(page).toContain('redirect("/mobile/service/truck-inventory")');
    expect(page).not.toContain(
      'import MobileTruckInventory from "@/features/parts/mobile/MobileTruckInventory"',
    );
    expect(partsPage).not.toContain('href="/mobile/parts/truck"');
    expect(mobileTiles).not.toContain('href: "/mobile/parts/truck"');
    expect(fieldPage).toContain("MobileTruckInventory");
    expect(fieldShell).toContain('label: "Truck inventory"');
    expect(fieldShell).toContain('href: "/mobile/service/truck-inventory"');
    expect(ui).toContain('fetch("/api/mobile/service-visits/truck-inventory"');
    expect(ui).toContain("On hand");
    expect(ui).toContain("Reserved");
    expect(ui).toContain("Available");
    expect(ui).toContain("Search truck stock");
  });

  it("handles no-call and missing-truck states explicitly", () => {
    expect(ui).toContain("No assigned service call");
    expect(ui).toContain("No truck stock location assigned");
    expect(api).toContain("items: []");
  });
});
