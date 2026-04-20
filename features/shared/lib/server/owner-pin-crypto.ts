import bcrypt from "bcryptjs";

export const OWNER_PIN_PATTERN = /^\d{4,8}$/;

export function normalizeOwnerPin(pin: string): string {
  return pin.trim();
}

export function isValidOwnerPin(pin: string): boolean {
  return OWNER_PIN_PATTERN.test(pin);
}

export async function hashOwnerPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyOwnerPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
