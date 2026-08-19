import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getInspectionBuilderNavigation } from "@/features/inspections/lib/inspectionBuilderNavigation";

const read = (path: string) => readFileSync(path, "utf8");

describe("Field inspection builder routes", () => {
  it("wraps the canonical Shop inspection builder on the Field surface", () => {
    const templates = read("app/mobile/service/inspection-builder/page.tsx");
    const create = read("app/mobile/service/inspection-builder/new/page.tsx");
    const review = read(
      "app/mobile/service/inspection-builder/review/page.tsx",
    );

    expect(templates).toContain(
      "@/features/inspections/app/inspection/templates/page",
    );
    expect(templates).toContain('<InspectionTemplatesPage surface="field" />');
    expect(create).toContain(
      "@/features/inspections/app/inspection/custom-inspection/page",
    );
    expect(create).toContain('<CustomInspectionPage surface="field" />');
    expect(create).toContain("<Suspense");
    expect(review).toContain(
      "@/features/inspections/components/InspectionTemplateEditRouter",
    );
    expect(review).toContain(
      '<InspectionTemplateEditRouter surface="field" />',
    );
    expect(review).toContain("<Suspense");
  });

  it("uses a server-authoritative Field and management-role gate", () => {
    const layout = read("app/mobile/service/inspection-builder/layout.tsx");

    expect(layout).toContain('import "server-only"');
    expect(layout).toContain("requireMobileServiceOperatorApiAccess()");
    expect(layout).toContain("if (!access.ok)");
    expect(layout).toContain('redirect("/mobile/service")');
    expect(layout).toContain("if (!access.managementRole)");
    expect(layout).toContain('redirect("/mobile/inspections")');
    expect(layout.indexOf("if (!access.ok)")).toBeLessThan(
      layout.indexOf("if (!access.managementRole)"),
    );
  });

  it("keeps Field builder navigation inside the Field workspace", () => {
    const navigation = getInspectionBuilderNavigation("field");

    expect(navigation.templatesHref).toBe("/mobile/service/inspection-builder");
    expect(navigation.newTemplateHref).toBe(
      "/mobile/service/inspection-builder/new",
    );
    expect(navigation.reviewHref("templateId=template-1")).toBe(
      "/mobile/service/inspection-builder/review?templateId=template-1",
    );
    expect(navigation.editHref("template 1", "Brake & tire check")).toBe(
      "/mobile/service/inspection-builder/review?templateId=template+1&template=Brake+%26+tire+check",
    );
    expect(navigation.useTemplateHref("template-1")).toBe(
      "/mobile/work-orders?templateId=template-1",
    );
    expect(navigation.menuItemHref("menu-item-1")).toBe("/mobile/work-orders");
    expect(navigation.mobileImport).toBe(true);
    expect(navigation.supportsStandaloneRun).toBe(false);
  });

  it("preserves Shop run context without reloading an older template", () => {
    const draft = read(
      "features/inspections/app/inspection/custom-draft/page.tsx",
    );
    const seedIndex = draft.indexOf(
      "const qs = new URLSearchParams(sp.toString());",
    );
    const deleteIndex = draft.indexOf('qs.delete("templateId");', seedIndex);
    const pushIndex = draft.indexOf(
      "router.push(`/inspections/run?${qs.toString()}`)",
      deleteIndex,
    );

    expect(seedIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(seedIndex);
    expect(pushIndex).toBeGreaterThan(deleteIndex);
  });

  it("keeps Shop template writes aligned with the management-only RLS boundary", () => {
    const templates = read(
      "features/inspections/app/inspection/templates/page.tsx",
    );
    const builderRoute = read("app/inspections/custom-inspection/page.tsx");
    const editorRoute = read("app/inspections/custom-draft/page.tsx");

    expect(templates).toContain(
      "hasAnyRole(resolvedRole, ROLE_GROUPS.billingOperators)",
    );
    expect(templates).toContain("canManageTemplates &&");
    for (const route of [builderRoute, editorRoute]) {
      expect(route).toContain("requireShopPageAccess");
      expect(route).toContain("allowRoles: ROLE_GROUPS.billingOperators");
      expect(route).toContain('redirectTo: "/inspections/templates"');
    }
  });
});
