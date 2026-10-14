import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EquipmentSetupChecklist from "@/features/equipment/components/EquipmentSetupChecklist";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const source = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("Equipment setup completion", () => {
  it("points incomplete setup steps at existing ProFixIQ workflows", () => {
    const markup = renderToStaticMarkup(
      <EquipmentSetupChecklist
        state={{
          meterRecorded: false,
          componentsConfigured: false,
          pmConfigured: false,
          inspectionRecorded: false,
        }}
      />,
    );

    expect(markup).toContain("0 of 4 complete");
    expect(markup).toContain('href="#asset-meters"');
    expect(markup).toContain('href="#asset-components"');
    expect(markup).toContain('href="#asset-pm"');
    expect(markup).toContain('href="/inspections"');
  });

  it("disappears once persisted setup evidence is complete", () => {
    const markup = renderToStaticMarkup(
      <EquipmentSetupChecklist
        state={{
          meterRecorded: true,
          componentsConfigured: true,
          pmConfigured: true,
          inspectionRecorded: true,
        }}
      />,
    );

    expect(markup).toBe("");
  });

  it("fails closed when a setup verification read is unavailable", () => {
    const markup = renderToStaticMarkup(
      <EquipmentSetupChecklist
        state={{
          meterRecorded: null,
          componentsConfigured: null,
          pmConfigured: true,
          inspectionRecorded: true,
        }}
      />,
    );

    expect(markup).toContain("2 of 4 complete");
    expect(markup.match(/Check unavailable/g)).toHaveLength(2);
    expect(markup).toContain("Open meters");
    expect(markup).toContain("Open components");
  });

  it("uses canonical applicability and persisted evidence for setup state", () => {
    const page = source("app/equipment/[assetId]/page.tsx");

    expect(page).toContain("canManageComponents(canonicalRole)");
    expect(page).toContain("componentTemplateForClass(equipmentProfile.equipmentClass).length");
    expect(page).toContain('equipmentProfile?.primaryMeter === "none"');
    expect(page).toContain('.from("equipment_meter_readings")');
    expect(page).toContain('.is("voided_at", null)');
    expect(page).toContain("{canManageSetup ? (");
  });

  it("refreshes server setup state after component mutations", () => {
    const panel = source("features/equipment/components/EquipmentComponentPanel.tsx");

    expect(panel).toContain('import { useRouter } from "next/navigation"');
    expect(panel).toContain("router.refresh()");
    expect(panel).toContain("await reloadSetupState()");
    expect(panel).toContain("void reloadSetupState()");
  });
});
