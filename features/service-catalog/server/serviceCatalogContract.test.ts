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
});
