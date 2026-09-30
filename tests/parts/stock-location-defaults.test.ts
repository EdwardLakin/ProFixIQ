import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260930120000_parts_default_stock_locations.sql",
);
const inventory = read("app/parts/inventory/page.tsx");
const locations = read("features/parts/lib/locations.ts");

describe("parts stock locations", () => {
  it("backfills MAIN without changing the shared shop creation contract", () => {
    expect(migration).toContain("from public.shops as shop");
    expect(migration).toContain("upper(trim(coalesce(location.code, ''))) = 'MAIN'");
    expect(migration).toContain("on conflict (shop_id, code) do nothing");
    expect(migration.toLowerCase()).not.toContain("create trigger");
    expect(migration.toLowerCase()).not.toContain("returns trigger");
  });

  it("creates defaults and locations only through parts-authorized, shop-scoped actions", () => {
    expect(locations).toContain('requiredCapability: "canManageParts"');
    expect(locations).toContain("access.profile.shop_id");
    expect(locations).toContain("input.shop_id !== shopId");
    expect(inventory).toContain("ensureInventoryMainLocation()");
    expect(inventory).toContain("createLocation({ shop_id: shopId, code, name })");
    expect(inventory).not.toContain('.eq("code", code)\n        .single()');
  });

  it("keeps location management usable and distinguishes load failures", () => {
    expect(inventory).toContain('title="Stock Locations"');
    expect(inventory).toContain("setLocsError(error.message");
    expect(inventory).toContain("Locations could not be loaded:");
    expect(inventory).toContain("max-h-[45vh] space-y-2 overflow-y-auto");
  });
});
