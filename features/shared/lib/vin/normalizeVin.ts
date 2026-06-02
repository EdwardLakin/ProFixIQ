export type VinValidationReason =
  | "valid"
  | "empty"
  | "invalid_character"
  | "forbidden_character"
  | "invalid_length";

export type NormalizedVinResult = {
  vin: string;
  isValid: boolean;
  reason: VinValidationReason;
  message: string;
};

const VIN_LENGTH = 17;
const VIN_SEPARATORS = /[\s\-_.:/\\|]+/g;
const VIN_ALLOWED_CHARS = /^[A-Z0-9]*$/;
const VIN_FORBIDDEN_CHARS = /[IOQ]/;

export function normalizeVinInput(input: unknown): NormalizedVinResult {
  const normalized = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(VIN_SEPARATORS, "");

  if (!normalized) {
    return {
      vin: normalized,
      isValid: false,
      reason: "empty",
      message: "VIN is required.",
    };
  }

  if (!VIN_ALLOWED_CHARS.test(normalized)) {
    return {
      vin: normalized,
      isValid: false,
      reason: "invalid_character",
      message: "VIN can only contain letters and numbers.",
    };
  }

  if (VIN_FORBIDDEN_CHARS.test(normalized)) {
    return {
      vin: normalized,
      isValid: false,
      reason: "forbidden_character",
      message: "VIN cannot contain I, O, or Q.",
    };
  }

  if (normalized.length !== VIN_LENGTH) {
    return {
      vin: normalized,
      isValid: false,
      reason: "invalid_length",
      message: "VIN must be exactly 17 characters.",
    };
  }

  return {
    vin: normalized,
    isValid: true,
    reason: "valid",
    message: "VIN is valid.",
  };
}

export function normalizeVinOrNull(input: unknown): string | null {
  const result = normalizeVinInput(input);
  return result.isValid ? result.vin : null;
}
