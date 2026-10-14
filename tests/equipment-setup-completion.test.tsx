import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EquipmentSetupChecklist from "@/features/equipment/components/EquipmentSetupChecklist";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const assetId = "11111111-1111-4111-8111-111111111111";

describe("Equipment setup completion", () => {
  it("points incomplete setup steps at existing ProFixIQ workflows", () => {
    const markup = renderToStaticMarkup(
      <EquipmentSetupChecklist
        assetId={assetId}
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
    expect(markup).toContain(`/inspections?vehicleId=${assetId}`);
  });

  it("disappears once persisted setup evidence is complete", () => {
    const markup = renderToStaticMarkup(
      <EquipmentSetupChecklist
        assetId={assetId}
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

  it("does not treat an unavailable component check as complete", () => {
    const markup = renderToStaticMarkup(
      <EquipmentSetupChecklist
        assetId={assetId}
        state={{
          meterRecorded: true,
          componentsConfigured: null,
          pmConfigured: true,
          inspectionRecorded: true,
        }}
      />,
    );

    expect(markup).toContain("3 of 4 complete");
    expect(markup).toContain("Check unavailable");
    expect(markup).toContain("Open components");
  });
});
