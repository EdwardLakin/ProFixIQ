import { describe, expect, it } from "vitest";

import { vehicleEngineKey } from "./vehicleEngineKey";

describe("vehicleEngineKey", () => {
  it("prefers the engine family", () => {
    expect(vehicleEngineKey({ engine_family: " Detroit ", engine: "DD15" })).toBe(
      "Detroit",
    );
  });

  it("falls back to the stored engine when the family is absent or blank", () => {
    expect(vehicleEngineKey({ engine_family: null, engine: " DD15 " })).toBe("DD15");
    expect(vehicleEngineKey({ engine_family: "  ", engine: "DD15" })).toBe("DD15");
  });

  it("is null when neither is set", () => {
    expect(vehicleEngineKey({ engine_family: null, engine: null })).toBeNull();
    expect(vehicleEngineKey({})).toBeNull();
  });
});
