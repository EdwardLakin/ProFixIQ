import { describe, expect, it } from "vitest";
import { TILES as dashboardTiles } from "@/features/shared/components/RoleHubTiles/tiles";
import { TILES as sidebarTiles } from "@/features/shared/config/tiles";

describe("vehicles dashboard navigation tiles", () => {
  it("exposes the dedicated Vehicles page from dashboard role tiles", () => {
    const vehiclesTile = dashboardTiles.find((tile) => tile.href === "/vehicles");

    expect(vehiclesTile).toMatchObject({
      title: "Vehicles",
      subtitle: "Units, VINs & plates",
      scopes: expect.arrayContaining(["work_orders", "all"]),
      roles: expect.arrayContaining(["advisor", "manager", "owner", "admin"]),
    });
  });

  it("keeps the sidebar Vehicles tile aligned with the dashboard tile", () => {
    const dashboardTile = dashboardTiles.find((tile) => tile.href === "/vehicles");
    const sidebarTile = sidebarTiles.find((tile) => tile.href === "/vehicles");

    expect(sidebarTile).toBeDefined();
    expect(dashboardTile?.title).toBe(sidebarTile?.title);
    expect(dashboardTile?.subtitle).toBe(sidebarTile?.subtitle);
  });
});
