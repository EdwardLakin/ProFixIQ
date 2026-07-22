import { describe, expect, it } from "vitest";

import { decodeVinLocally } from "@/features/shared/lib/vin/localDecodeVin";
import {
  calculateVinCheckDigit,
  chooseStableVin,
  extractVinCandidates,
  hasValidVinChecksum,
} from "@/features/shared/lib/vin/vinCapture";

const VALID_VIN = "1HGCM82633A004352";

describe("local VIN intake scan", () => {
  it("extracts a VIN from a prefixed barcode value", () => {
    const candidates = extractVinCandidates(`VIN:${VALID_VIN}`);

    expect(candidates[0]).toMatchObject({
      vin: VALID_VIN,
      checksumValid: true,
    });
  });

  it("calculates and validates the VIN check digit", () => {
    expect(calculateVinCheckDigit(VALID_VIN)).toBe("3");
    expect(hasValidVinChecksum(VALID_VIN)).toBe(true);
    expect(hasValidVinChecksum("1HGCM82643A004352")).toBe(false);
  });

  it("accepts checksum-confirmed VINs after two matching frames", () => {
    const result = chooseStableVin([VALID_VIN, VALID_VIN]);

    expect(result).toMatchObject({
      vin: VALID_VIN,
      checksumValid: true,
      matches: 2,
      requiredMatches: 2,
    });
  });

  it("requires three matching frames when a global VIN does not use the check digit", () => {
    const vinWithoutMatchingCheckDigit = "1HGCM82643A004352";

    expect(
      chooseStableVin([
        vinWithoutMatchingCheckDigit,
        vinWithoutMatchingCheckDigit,
      ]),
    ).toBeNull();

    expect(
      chooseStableVin([
        vinWithoutMatchingCheckDigit,
        vinWithoutMatchingCheckDigit,
        vinWithoutMatchingCheckDigit,
      ]),
    ).toMatchObject({
      vin: vinWithoutMatchingCheckDigit,
      checksumValid: false,
      matches: 3,
      requiredMatches: 3,
    });
  });

  it("provides a local year and common make without a network request", () => {
    expect(decodeVinLocally(VALID_VIN)).toMatchObject({
      vin: VALID_VIN,
      year: "2003",
      make: "Honda",
      manufacturer: "Honda",
      country: "United States",
    });
  });
});
