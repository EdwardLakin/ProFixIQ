import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPLETED_REPAIR_SOURCE,
  buildCompletedRepairTemplateKey,
  completedNetQuantity,
  isCompletedRepairStatus,
  matchesCompletedRepairVehicle,
  resolveCompletedRepairSubtotal,
} from "@/features/menu-repair-items/lib/completedRepair";

const read = (path: string) => readFileSync(path, "utf8");

describe("completed repair memory", () => {
  it("recognizes only final repair lifecycle states", () => {
    expect(COMPLETED_REPAIR_SOURCE).toBe("completed_work_order_line");
    expect(isCompletedRepairStatus("completed")).toBe(true);
    expect(isCompletedRepairStatus("ready_to_invoice")).toBe(true);
    expect(isCompletedRepairStatus("invoiced")).toBe(true);
    expect(isCompletedRepairStatus("quoted")).toBe(false);
    expect(isCompletedRepairStatus("approved")).toBe(false);
  });

  it("uses final net-consumed quantity", () => {
    expect(completedNetQuantity(4, 1)).toBe(3);
    expect(completedNetQuantity(1, 2)).toBe(0);
    expect(completedNetQuantity("2.5", "0.5")).toBe(2);
  });

  it("combines completed parts pricing with labor exactly once", () => {
    expect(
      resolveCompletedRepairSubtotal({
        useFinalPricing: true,
        snapshotPartsTotal: 100,
        partsTotal: 100,
        laborTotal: 150,
      }),
    ).toBe(250);
    expect(
      resolveCompletedRepairSubtotal({
        useFinalPricing: true,
        snapshotPartsTotal: 100,
        partsTotal: null,
        laborTotal: 150,
      }),
    ).toBe(250);
    expect(
      resolveCompletedRepairSubtotal({
        useFinalPricing: false,
        snapshotPartsTotal: 100,
        partsTotal: 100,
        laborTotal: 150,
      }),
    ).toBeNull();
  });

  it("requires exact YMM and blocks known powertrain conflicts", () => {
    const completed = {
      year: 2018,
      make: "Ford",
      model: "F-150",
      engine: "3.5L EcoBoost",
      drivetrain: "4WD",
    };
    expect(matchesCompletedRepairVehicle(completed, completed)).toBe(true);
    expect(
      matchesCompletedRepairVehicle(
        { ...completed, year: 2019 },
        completed,
      ),
    ).toBe(false);
    expect(
      matchesCompletedRepairVehicle(
        { ...completed, engine: "5.0L" },
        completed,
      ),
    ).toBe(false);
    expect(
      matchesCompletedRepairVehicle(
        { ...completed, model: "F150", transmission: "10-speed" },
        { ...completed, model: "F-150", transmission: "10 speed" },
      ),
    ).toBe(true);
    expect(
      matchesCompletedRepairVehicle(
        { make: "Ford", model: "F-150" },
        completed,
      ),
    ).toBe(false);
  });

  it("builds a stable shop and vehicle-scoped repair key", () => {
    const first = buildCompletedRepairTemplateKey({
      shopId: "shop-1",
      year: 2018,
      make: "Ford",
      model: "F-150",
      submodel: "Lariat",
      engine: "3.5L EcoBoost",
      drivetrain: "4WD",
      transmission: "10 Speed",
      title: "Front Brake Replacement",
    });
    const replay = buildCompletedRepairTemplateKey({
      shopId: "shop-1",
      year: 2018,
      make: " ford ",
      model: "F 150",
      submodel: "LARIAT",
      engine: "3.5L ECOBOOST",
      drivetrain: "4wd",
      transmission: "10-speed",
      title: "Front brake replacement",
    });
    expect(replay).toBe(first);
  });

  it("keeps completion authoritative and repair learning fail-open", () => {
    const finishRoute = read("app/api/work-orders/lines/[id]/finish/route.ts");
    const completedHelper = read(
      "features/menu-repair-items/server/upsertMenuRepairItemFromCompletedLine.ts",
    );
    const addFromRepair = read(
      "app/api/work-orders/quotes/add-from-menu-repair/route.ts",
    );

    expect(finishRoute.indexOf("await applyJobPunchTransition")).toBeLessThan(
      finishRoute.indexOf("await upsertMenuRepairItemFromCompletedLine"),
    );
    expect(finishRoute).toContain("completed repair memory update failed");
    expect(completedHelper).toContain('.from("work_order_parts")');
    expect(completedHelper).toContain('.from("menu_repair_item_pricing_parts")');
    expect(completedHelper).toContain("completedNetQuantity");
    expect(completedHelper).toContain("completedSourceLineIds.add(line.id)");
    expect(completedHelper).toContain("usage_count: completedUsageCount");
    expect(completedHelper).not.toContain("existing.usage_count ?? 0");
    expect(completedHelper).toContain("total_sell: partSellTotal");
    expect(completedHelper).not.toContain("total_sell: completedTotal");
    expect(addFromRepair).toContain("Repair item is not backed by completed work");
    expect(addFromRepair).toContain("Repair history does not match this vehicle");
    expect(addFromRepair).toContain("COMPLETED_REPAIR_SOURCE");
    expect(addFromRepair).toContain("resolveCompletedRepairSubtotal");
    const matchRoute = read("app/api/menu-repair-items/match/route.ts");
    expect(matchRoute).toContain("if (repairTextScore <= 0) return null");
  });

  it("exposes completed repairs separately in the premium menu UI", () => {
    const menuPage = read("app/menu/page.tsx");
    const inspectionBuilder = read(
      "features/inspections/app/inspection/custom-inspection/page.tsx",
    );
    expect(menuPage).toContain("Learned from completed work");
    expect(menuPage).toContain("Exact YMM suggestions only");
    expect(menuPage).toContain("Create service");
    expect(menuPage).toMatch(
      /\.from\("menu_items"\)[\s\S]{0,500}\.order\("created_at", \{ ascending: false \}\)/,
    );
    expect(menuPage).not.toMatch(
      /\.from\("menu_items"\)[\s\S]{0,500}\.order\("updated_at"/,
    );
    expect(menuPage).toMatch(
      /\.from\("menu_items"\)[\s\S]{0,700}\.limit\(1000\)/,
    );
    expect(menuPage).toContain("shopServicesLoadFailed");
    expect(menuPage).toContain("Your saved services have not been removed.");
    expect(menuPage).toContain("Retry loading services");
    expect(menuPage).toContain("statusCounts[status]");
    expect(inspectionBuilder).toContain('buildMethod === "template"');
    expect(inspectionBuilder).toContain('buildMethod === "prompt"');
    expect(inspectionBuilder).toContain('buildMethod === "manual"');
    expect(inspectionBuilder).toContain("Only the active workspace is shown.");
  });

  it("restores shop-scoped access to reusable part-pricing snapshots", () => {
    const migration = read(
      "supabase/migrations/20260731223000_restore_menu_repair_pricing_parts_shop_access.sql",
    );
    expect(migration).toContain("menu_repair_item_pricing_parts_select_shop");
    expect(migration).toContain("menu_repair_item_pricing_parts_insert_shop");
    expect(migration).toContain("menu_repair_item_pricing_parts_update_shop");
    expect(migration).toContain("menu_repair_item_pricing_parts_delete_shop");
    expect(migration).toContain("public.is_shop_member_v2(snapshot.shop_id)");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("to anon");
  });
});
