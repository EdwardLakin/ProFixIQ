import { describe, expect, it } from "vitest";
import { resolvePlanPresentation } from "./demoPlanPresentation";

describe("resolvePlanPresentation", () => {
  it("presents an internal demo as the complete package with unlimited seats", () => {
    expect(resolvePlanPresentation("starter", "internal_demo")).toEqual({
      plan: "unlimited",
      label: "Complete Operations (Demo)",
      seatLimit: null,
    });
  });

  it("preserves the saved package and seat cap for paid shops", () => {
    expect(resolvePlanPresentation("starter", null)).toEqual({
      plan: "starter",
      label: "Starter",
      seatLimit: 10,
    });
  });

  it("fails safely to Starter when the stored package is unknown", () => {
    expect(resolvePlanPresentation("not-a-plan", null)).toEqual({
      plan: "starter",
      label: "Starter",
      seatLimit: 10,
    });
  });
});
