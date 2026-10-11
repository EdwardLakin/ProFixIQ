import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("inspection template server-authoritative write boundary", () => {
  it("revokes direct authenticated content writes without changing direct reads", () => {
    const migration = read(
      "supabase/migrations/20261011185000_inspection_template_server_write_boundary.sql",
    );

    expect(migration).toContain(
      "revoke insert, update\n  on table public.inspection_templates\n  from authenticated;",
    );
    expect(migration).toContain(
      "grant select, delete\n  on table public.inspection_templates\n  to authenticated;",
    );
    expect(migration).not.toContain("revoke select");
    expect(migration).not.toContain("revoke delete");
  });

  it("keeps Shop template mutations behind the existing billing-operator boundary", () => {
    const route = read("app/api/inspections/templates/route.ts");

    expect(route).toContain("ROLE_GROUPS.billingOperators");
    expect(route).toContain("createAdminSupabase()");
    expect(route).toContain("shop_id: access.profile.shop_id");
    expect(route).toContain("user_id: access.authUserId");
    expect(route).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(route).toContain('.eq("user_id", access.authUserId)');
  });

  it("routes Shop draft create, update, and silent-save through the Shop API", () => {
    const draft = read(
      "features/inspections/app/inspection/custom-draft/page.tsx",
    );

    expect(draft).toContain('"/api/inspections/templates"');
    expect(draft).toContain('saveInspectionTemplate("POST"');
    expect(draft).toContain('saveInspectionTemplate("PATCH"');
    expect(draft).not.toContain('.from("inspection_templates")\n          .insert');
    expect(draft).not.toContain('.from("inspection_templates")\n          .update');
  });

  it("routes imported-template edits through Shop or Field APIs without browser DML", () => {
    const editor = read(
      "features/inspections/components/InspectionTemplateEditRouter.tsx",
    );

    expect(editor).toContain('navigation.surface === "field"');
    expect(editor).toContain('"/api/mobile/service/inspection-templates"');
    expect(editor).toContain('"/api/inspections/templates"');
    expect(editor).toContain("...(formContextDirty ? { formContext } : {})");
    expect(editor).toContain("...(tagsDirty ? { tags } : {})");
    expect(editor).not.toContain('.from("inspection_templates")\n          .update');
  });

  it("keeps Field authorization but uses the server writer after it succeeds", () => {
    const fieldRoute = read(
      "app/api/mobile/service/inspection-templates/route.ts",
    );

    expect(fieldRoute).toContain("requireMobileServiceOperatorApiAccess()");
    expect(fieldRoute).toContain("access.managementRole");
    expect(fieldRoute).toContain("createAdminSupabase()");
    expect(fieldRoute).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(fieldRoute).toContain('.eq("user_id", access.authUserId)');
  });

  it("preserves optimization role, tenant, and owner checks around admin template DML", () => {
    const apply = read("app/api/optimization/apply/route.ts");
    const undo = read("app/api/optimization/undo/route.ts");

    for (const source of [apply, undo]) {
      expect(source).toContain("ROLE_GROUPS.billingOperators");
      expect(source).toContain("canonicalizeRole");
      expect(source).toContain('.select("shop_id,role")');
      expect(source).toContain('.eq("shop_id", profile.shop_id)');
      expect(source).toContain('.eq("user_id", user.id)');
    }

    expect(apply).toContain("const templateAdmin = createAdminSupabase();");
    expect(apply).toContain("await templateAdmin\n          .from(\"inspection_templates\")");

    expect(undo).toContain("const admin = createAdminSupabase();");
    expect(undo).toContain("await admin\n        .from(\"inspection_templates\")");
  });
});
