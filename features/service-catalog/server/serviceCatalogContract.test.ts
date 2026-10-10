import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("service catalog import contract", () => {
  const migration = read("supabase/migrations/20261010030310_import_service_catalog.sql");
  const previewRoute = read("app/api/service-catalog/preview/route.ts");
  const importRoute = read("app/api/service-catalog/import/route.ts");

  it("writes templates, services and links in one function, owned by the actor", () => {
    expect(migration).toContain("create or replace function public.import_service_catalog");
    expect(migration.indexOf("insert into public.inspection_templates")).toBeLessThan(
      migration.indexOf("insert into public.menu_items"),
    );
    expect(migration).toMatch(/p_actor_auth_user_id, v_tpl\.name/);
    expect(migration).toContain("true, 'service_catalog_import', v_svc.service_key");
    expect(migration).toMatch(/labor_time, labor_hours/);
    expect(migration).not.toContain("structured_sections");
  });

  it("previews without writing and re-derives the plan server-side on import", () => {
    expect(previewRoute).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
    expect(importRoute).toContain("readCatalogRequest");
    expect(importRoute).toContain("import_service_catalog");
    expect(importRoute).toContain('allowRoles: [...SERVICE_CATALOG_ROLES]');
  });

  describe("parts (BOM) mapping", () => {
    const partsMigration = read("supabase/migrations/20261010160000_service_catalog_parts_bom.sql");
    const previewSource = read("app/api/service-catalog/preview/route.ts");

    it("is additive: new functions only, the merged importer is called not redefined", () => {
      expect(partsMigration).not.toContain("create or replace function public.import_service_catalog(");
      expect(partsMigration).toContain("v_result := public.import_service_catalog(");
      expect(partsMigration).toMatch(/create or replace function public\.resolve_catalog_parts/);
      expect(partsMigration).toMatch(/create or replace function public\.import_service_catalog_with_parts/);
    });

    it("writes the same recipe + intake records as the service builder, with explicit enum casts", () => {
      expect(partsMigration).toContain("insert into public.menu_item_parts");
      expect(partsMigration).toContain("insert into public.part_requests");
      expect(partsMigration).toContain("insert into public.part_request_items");
      expect(partsMigration).toContain("::public.part_request_status");
      expect(partsMigration).toContain("::public.part_request_item_status");
      expect(partsMigration).toContain("source_menu_item_part_id");
    });

    it("matches inventory scoped to the shop, and the preview uses the same resolver", () => {
      expect(partsMigration).toMatch(/p\.shop_id = p_shop_id/);
      expect(previewSource).toContain("resolvePlanParts");
      expect(read("features/service-catalog/server/resolveParts.ts")).toContain('"resolve_catalog_parts"');
      expect(importRoute).toContain("import_service_catalog_with_parts");
      expect(importRoute).toContain("p_parts: payload.parts");
    });
  });
});
