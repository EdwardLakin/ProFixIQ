import { describe, expect, it } from "vitest";
import { extractPortalIntakeConcern } from "../features/portal/lib/request/portalIntake";

describe("extractPortalIntakeConcern", () => {
  it("returns concern line when present", () => {
    const notes = "PORTAL INTAKE\nConcern: Engine knocking under acceleration\nDetails: Happens when warm";
    expect(extractPortalIntakeConcern(notes)).toBe("Engine knocking under acceleration");
  });

  it("falls back to first non-details line after marker", () => {
    const notes = "PORTAL INTAKE\nBrake vibration at highway speed\nDetails: front axle";
    expect(extractPortalIntakeConcern(notes)).toBe("Brake vibration at highway speed");
  });

  it("returns null for non-intake notes", () => {
    expect(extractPortalIntakeConcern("General notes only")).toBeNull();
  });
});
