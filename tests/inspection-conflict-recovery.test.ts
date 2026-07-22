import { describe, expect, it } from "vitest";

import {
  automaticallyMergeInspectionConflict,
  inspectionConflictRows,
  mergeInspectionConflict,
} from "../features/inspections/lib/inspection/conflictRecovery";
import type { InspectionSession } from "../features/inspections/lib/inspection/types";

function session(
  revision: number,
  value: string,
  notes: string,
  photoUrls: string[],
): InspectionSession {
  return {
    id: "inspection-1",
    workOrderId: "work-order-1",
    workOrderLineId: "line-1",
    currentSectionIndex: 0,
    currentItemIndex: 0,
    isListening: false,
    status: "in_progress",
    started: true,
    completed: false,
    isPaused: false,
    syncRevision: revision,
    sections: [
      {
        title: "Hydraulic brakes",
        items: [
          {
            item: "Left front pad",
            status: "fail",
            value,
            unit: "mm",
            notes,
            photoUrls,
          },
        ],
      },
    ],
  };
}

describe("inspection conflict recovery", () => {
  it("compares the canonical item instead of choosing by device timestamp", () => {
    const rows = inspectionConflictRows(
      session(1, "2", "Metal to metal", ["device-photo"]),
      session(4, "8", "", ["server-photo"]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deviceItem.value).toBe("2");
    expect(rows[0].serverItem.value).toBe("8");
  });

  it("rebases selected device evidence onto the server revision", () => {
    const device = session(1, "2", "Metal to metal", ["device-photo"]);
    const server = session(4, "8", "", ["server-photo"]);
    const row = inspectionConflictRows(device, server)[0];
    const merged = mergeInspectionConflict({
      device,
      server,
      choices: { [row.key]: "device" },
    });

    expect(merged.syncRevision).toBe(4);
    expect(merged.sections[0].items[0]).toMatchObject({
      value: "2",
      notes: "Metal to metal",
      photoUrls: ["server-photo", "device-photo"],
    });
  });

  it("keeps the shop item when explicitly selected", () => {
    const device = session(1, "2", "Device", ["device-photo"]);
    const server = session(4, "8", "Shop", ["server-photo"]);
    const row = inspectionConflictRows(device, server)[0];
    const merged = mergeInspectionConflict({
      device,
      server,
      choices: { [row.key]: "server" },
    });

    expect(merged.sections[0].items[0]).toEqual(server.sections[0].items[0]);
  });

  it("automatically gives the installed app priority over desktop", () => {
    const device = session(1, "2", "Device", ["device-photo"]);
    const server = {
      ...session(4, "8", "Desktop", ["server-photo"]),
      syncSource: "desktop" as const,
      syncClientId: "desktop-1",
    };
    const merged = automaticallyMergeInspectionConflict({
      device,
      server,
      currentSource: "installed",
      currentClientId: "installed-1",
    });
    expect(merged?.sections[0].items[0].value).toBe("2");
    expect(merged?.syncRevision).toBe(4);
  });

  it("requires review only for conflicting devices at the same tier", () => {
    const device = session(1, "2", "Phone A", []);
    const server = {
      ...session(4, "3", "Phone B", []),
      syncSource: "installed" as const,
      syncClientId: "installed-2",
    };
    expect(
      automaticallyMergeInspectionConflict({
        device,
        server,
        currentSource: "installed",
        currentClientId: "installed-1",
      }),
    ).toBeNull();
  });

  it("uses mobile web ahead of desktop and keeps installed ahead of desktop", () => {
    const mobile = session(1, "4", "Mobile web", []);
    const desktop = {
      ...session(3, "8", "Desktop", []),
      syncSource: "desktop" as const,
      syncClientId: "desktop-1",
    };
    expect(
      automaticallyMergeInspectionConflict({
        device: mobile,
        server: desktop,
        currentSource: "mobile_web",
        currentClientId: "mobile-web-1",
      })?.sections[0].items[0].value,
    ).toBe("4");

    const installed = { ...desktop, syncSource: "installed" as const };
    expect(
      automaticallyMergeInspectionConflict({
        device: desktop,
        server: installed,
        currentSource: "desktop",
        currentClientId: "desktop-2",
      })?.sections[0].items[0].value,
    ).toBe("8");
  });
});
