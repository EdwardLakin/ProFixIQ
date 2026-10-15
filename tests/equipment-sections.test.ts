import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EQUIPMENT_SECTIONS,
  equipmentAssetSectionHref,
  equipmentSectionSignal,
  equipmentSectionsForRole,
  type EquipmentAssetSectionKey,
} from "@/features/equipment/lib/equipmentSections";

const keys = (role: Parameters<typeof equipmentSectionsForRole>[0]) =>
  equipmentSectionsForRole(role).map((section) => section.key);

describe("Equipment section registry", () => {
  it("has unique keys and hrefs", () => {
    expect(new Set(EQUIPMENT_SECTIONS.map((s) => s.key)).size).toBe(EQUIPMENT_SECTIONS.length);
    expect(new Set(EQUIPMENT_SECTIONS.map((s) => s.href)).size).toBe(EQUIPMENT_SECTIONS.length);
  });

  it("shows every Equipment page to directory roles", () => {
    for (const role of ["owner", "manager", "advisor", "parts", "foreman"] as const) {
      expect(keys(role)).toEqual(
        expect.arrayContaining(["assets", "work-orders", "pm", "inspections", "components", "measurements", "undercarriage", "fluid-analysis"]),
      );
    }
  });

  it("only links out to shop surfaces the role can open", () => {
    expect(keys("owner")).toEqual(expect.arrayContaining(["scheduling", "parts", "billing", "reports", "settings"]));
    // Managers: no owner settings. Advisors: no reports. Parts: parts only.
    expect(keys("manager")).not.toContain("settings");
    expect(keys("manager")).toContain("reports");
    expect(keys("advisor")).not.toContain("reports");
    expect(keys("advisor")).toContain("billing");
    expect(keys("parts")).toContain("parts");
    expect(keys("parts")).not.toContain("billing");
    expect(keys("parts")).not.toContain("settings");
  });

  it("deep-links per-asset sections to the existing asset panels", () => {
    expect(equipmentAssetSectionHref("pm", "a1")).toBe("/equipment/a1#asset-pm");
    expect(equipmentAssetSectionHref("fluid-analysis", "a1")).toBe("/equipment/a1#asset-fluid-samples");
  });

  it("points every anchor at a heading that exists on the asset page", () => {
    const panels = [
      "features/equipment/components/AssetHealthView.tsx",
      "features/equipment/components/EquipmentComponentPanel.tsx",
      "features/equipment/components/EquipmentMeasurementPanel.tsx",
      "features/equipment/components/EquipmentUndercarriagePanel.tsx",
      "features/equipment/components/EquipmentFluidSamplePanel.tsx",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const section of EQUIPMENT_SECTIONS.filter((s) => s.assetAnchor)) {
      expect(panels).toContain(`"${section.assetAnchor}"`);
    }
  });

  it("serves every Equipment page through the shared entitlement-gated loader", () => {
    const shared = readFileSync("features/equipment/server/EquipmentSectionPage.tsx", "utf8");
    expect(shared).toContain("resolveEquipmentPageEntitlement");
    expect(shared).toContain("EQUIPMENT_DIRECTORY_ROLES");
    expect(shared).toContain("loadEquipmentDirectory");
    for (const section of EQUIPMENT_SECTIONS.filter((s) => !s.external && s.assetAnchor)) {
      const page = readFileSync(`app${section.href}/page.tsx`, "utf8");
      expect(page).toContain(`section="${section.key}"`);
    }
  });
});

describe("equipmentSectionSignal", () => {
  const base = {
    pm: { state: "ok" as const, dueCount: 0 },
    inspection: { state: "clear" as const, recordedAt: null },
    openDefects: { total: 0, failed: 0 },
    operatingStatus: "operational" as const,
  };

  it("ranks overdue PM ahead of due, up to date, and not evaluated", () => {
    const rank = (state: "overdue" | "due" | "ok" | "not_evaluated") =>
      equipmentSectionSignal("pm", { ...base, pm: { state, dueCount: 0 } }).rank;
    expect(rank("overdue")).toBeLessThan(rank("due"));
    expect(rank("due")).toBeLessThan(rank("ok"));
    expect(rank("ok")).toBeLessThan(rank("not_evaluated"));
  });

  it("puts failed inspection findings first", () => {
    const failed = equipmentSectionSignal("inspections", {
      ...base,
      inspection: { state: "findings", recordedAt: null },
      openDefects: { total: 2, failed: 1 },
    });
    const none = equipmentSectionSignal("inspections", { ...base, inspection: { state: "none", recordedAt: null } });
    expect(failed).toMatchObject({ rank: 0, tone: "bad", label: "2 findings (1 failed)" });
    expect(failed.rank).toBeLessThan(none.rank);
  });

  it("shows operating state for engines without a fleet read model", () => {
    for (const key of ["components", "measurements", "undercarriage", "fluid-analysis"] as EquipmentAssetSectionKey[]) {
      expect(equipmentSectionSignal(key, { ...base, operatingStatus: "down" })).toMatchObject({ rank: 0, tone: "bad" });
      expect(equipmentSectionSignal(key, base).rank).toBe(1);
    }
  });
});
