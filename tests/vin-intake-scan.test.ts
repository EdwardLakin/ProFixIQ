import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { decodeVinLocally } from "@/features/shared/lib/vin/localDecodeVin";
import {
  calculateVinCheckDigit,
  chooseStableVin,
  extractVinCandidates,
  hasValidVinChecksum,
  pickBestOcrVin,
} from "@/features/shared/lib/vin/vinCapture";

const VALID_VIN = "1HGCM82633A004352";
const FORD_LABEL_VIN = "1FD0W5HT4FED33898";
const scannerSource = readFileSync(
  "features/vehicles/components/VehicleIntakeScanner.tsx",
  "utf8",
);
const modalSource = readFileSync("app/vehicle/VinCaptureModal.tsx", "utf8");
const imageRouteSource = readFileSync(
  "app/api/vin/extract-from-image/route.ts",
  "utf8",
);

describe("VIN intake scan", () => {
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

  it("corrects a printed Ford VIN when OCR reads O instead of zero", () => {
    expect(pickBestOcrVin("VIN: 1FDOW5HT4FED33898")).toMatchObject({
      vin: FORD_LABEL_VIN,
      checksumValid: true,
      corrections: 1,
    });
  });

  it("extracts a spaced printed VIN from label text", () => {
    expect(pickBestOcrVin("VIN 1FDO W5HT4 FED33898")).toMatchObject({
      vin: FORD_LABEL_VIN,
      checksumValid: true,
    });
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

  it("keeps an iOS-capable VIN-specific Quagga fallback", () => {
    expect(scannerSource).toContain('"code_39_vin_reader"');
    expect(scannerSource).toContain("halfSample: false");
    expect(scannerSource).toContain("inputSize: 0");
    expect(scannerSource).toContain("QUAGGA_PASS_TIMEOUT_MS");
    expect(scannerSource).toContain('mode: "live" | "photo"');
  });

  it("reads printed VIN text after local barcode decoding fails", () => {
    expect(scannerSource).toContain('fetch("/api/vin/extract-from-image"');
    expect(scannerSource).toContain("canvasToJpegFile");
    expect(scannerSource).toContain("drawFullVideoFrame");
    expect(scannerSource).toContain("Capture VIN label");
    expect(scannerSource).toContain("Reading printed VIN");
  });

  it("uses shop-scoped access and checksum-aware OCR extraction", () => {
    expect(imageRouteSource).toContain("requireShopScopedApiAccess");
    expect(imageRouteSource).toContain("pickBestOcrVin");
    expect(imageRouteSource).toContain("checksum_confirmed");
  });

  it("does not duplicate scanner errors in the parent modal", () => {
    expect(modalSource).not.toContain("onError={setCaptureError}");
  });
});
