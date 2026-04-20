import { describe, expect, it } from "vitest";
import {
  hashOwnerPin,
  isValidOwnerPin,
  normalizeOwnerPin,
  verifyOwnerPin,
} from "../features/shared/lib/server/owner-pin-crypto";

describe("owner pin crypto", () => {
  it("normalizes owner pins", () => {
    expect(normalizeOwnerPin(" 1234 ")).toBe("1234");
  });

  it("accepts only 4-8 numeric digits", () => {
    expect(isValidOwnerPin("1234")).toBe(true);
    expect(isValidOwnerPin("12345678")).toBe(true);
    expect(isValidOwnerPin("123")).toBe(false);
    expect(isValidOwnerPin("123456789")).toBe(false);
    expect(isValidOwnerPin("12ab")).toBe(false);
  });

  it("hashes and verifies correctly", async () => {
    const pin = "987654";
    const hash = await hashOwnerPin(pin);

    expect(hash).not.toEqual(pin);
    await expect(verifyOwnerPin(pin, hash)).resolves.toBe(true);
    await expect(verifyOwnerPin("1111", hash)).resolves.toBe(false);
  });
});
