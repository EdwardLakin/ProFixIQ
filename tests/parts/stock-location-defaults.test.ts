import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260930120000_parts_default_stock_locations.sql",
);
const inventory = read("app/parts/inventory/page.tsx");

describe("parts stock locations", () => {
  it("seeds MAIN for existing and newly created shops without replacing existing locations", () => {
    expect(migration).toContain("after insert on public.shops");
    expect(migration).toContain("values (new.id, 'MAIN', 'Main Stock')");
    expect(migration).toContain("on conflict (shop_id, code) do nothing");
    expect(migration).toContain("from public.shops as shop");
  });

  it("makes stock locations manageable from inventory and distinguishes load failures", () => {
    expect(inventory).toContain('title="Stock Locations"');
    expect(inventory).toContain("createLocation({ shop_id: shopId, code, name })");
    expect(inventory).toContain("setLocsError(error.message");
    expect(inventory).toContain("Locations could not be loaded:");
  });
});
