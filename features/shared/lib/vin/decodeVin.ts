import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

export type DecodedVin = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  submodel?: string | null;
  engine?: string | null;
  engineFamily?: string | null;
  engineType?: string | null;

  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  transmissionType?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  gvwr?: string | null;

  error?: string;
};

export type VinSelectValues = {
  fuel_type?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
};

function compactToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function mapFuelTypeToVehicleValue(value: unknown): string | null {
  const normalized = compactToken(value);
  if (!normalized) return null;
  if (normalized.includes("diesel")) return "diesel";
  if (normalized.includes("plug in") || normalized.includes("phev")) return "phev";
  if (normalized.includes("hybrid")) return "hybrid";
  if (
    normalized.includes("electric") ||
    normalized.includes("bev") ||
    normalized.includes("battery")
  ) {
    return "electric";
  }
  if (
    normalized.includes("gasoline") ||
    normalized.includes("gas") ||
    normalized.includes("petrol")
  ) {
    return "gasoline";
  }
  return "other";
}

export function mapTransmissionToVehicleValue(value: unknown): string | null {
  const normalized = compactToken(value);
  if (!normalized) return null;
  if (normalized.includes("cvt") || normalized.includes("continuously variable")) {
    return "cvt";
  }
  if (normalized.includes("dual clutch") || normalized.includes("dct")) {
    return "dct";
  }
  if (normalized.includes("automatic")) return "automatic";
  if (normalized.includes("manual")) return "manual";
  return "other";
}

export function mapDriveTypeToVehicleValue(value: unknown): string | null {
  const normalized = compactToken(value);
  if (!normalized) return null;
  if (
    normalized.includes("all wheel") ||
    normalized.includes("awd")
  ) {
    return "awd";
  }
  if (
    normalized.includes("four wheel") ||
    normalized.includes("4wd") ||
    normalized.includes("4x4")
  ) {
    return "4x4";
  }
  if (
    normalized.includes("front wheel") ||
    normalized.includes("fwd")
  ) {
    return "fwd";
  }
  if (
    normalized.includes("rear wheel") ||
    normalized.includes("rwd")
  ) {
    return "rwd";
  }
  return "other";
}

export function mapDecodedVinToVehicleSelectValues(
  decoded: Pick<DecodedVin, "fuelType" | "transmission" | "driveType">,
): VinSelectValues {
  return {
    fuel_type: mapFuelTypeToVehicleValue(decoded.fuelType),
    transmission: mapTransmissionToVehicleValue(decoded.transmission),
    drivetrain: mapDriveTypeToVehicleValue(decoded.driveType),
  };
}

export async function decodeVin(
  vin: string,
  userId: string,
): Promise<DecodedVin> {
  const normalizedVin = normalizeVinInput(vin);
  if (!normalizedVin.isValid) {
    return { error: normalizedVin.message };
  }

  const res = await fetch("/api/vin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vin: normalizedVin.vin, user_id: userId }),
  });

  if (!res.ok) {
    try {
      return (await res.json()) as DecodedVin;
    } catch {
      return { error: `VIN decode failed (${res.status})` };
    }
  }

  return (await res.json()) as DecodedVin;
}