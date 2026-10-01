import { describe, expect, it } from "vitest";
import { inferUnitSystem } from "@/features/inspections/lib/inspection/inferUnitSystem";

const sec = (...units: Array<string | null>) => ({ items: units.map((unit) => ({ unit })) });

describe("inferUnitSystem", () => {
  it("is imperial for 32nds / psi / in forms", () => {
    expect(inferUnitSystem([sec("32nds", "psi", "in", null)])).toBe("imperial");
    expect(inferUnitSystem([sec("/32", "PSI")])).toBe("imperial");
  });
  it("is metric for mm / kPa forms", () => {
    expect(inferUnitSystem([sec("mm", "kPa", "N·m")])).toBe("metric");
  });
  it("follows the larger share on mixed forms and is undecided on a tie or no units", () => {
    expect(inferUnitSystem([sec("32nds", "32nds", "psi", "mm")])).toBe("imperial");
    expect(inferUnitSystem([sec(null, "")])).toBeNull();
    expect(inferUnitSystem([sec("mm", "psi")])).toBeNull();
    expect(inferUnitSystem([])).toBeNull();
  });
});
