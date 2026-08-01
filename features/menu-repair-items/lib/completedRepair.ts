export const COMPLETED_REPAIR_STATUSES = [
  "completed",
  "ready_to_invoice",
  "invoiced",
] as const;

export const COMPLETED_REPAIR_SOURCE = "completed_work_order_line" as const;

export function isCompletedRepairStatus(value: unknown): boolean {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (COMPLETED_REPAIR_STATUSES as readonly string[]).includes(status);
}

function normalizedVehicleText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
    : "";
}

function normalizedVehicleYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compactKeyPart(value: unknown): string {
  return (
    (typeof value === "string" ? value.trim() : String(value ?? ""))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") || "na"
  );
}

export function buildCompletedRepairTemplateKey(args: {
  shopId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  submodel: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  title: string;
}): string {
  return [
    args.shopId,
    args.year ?? "na",
    compactKeyPart(args.make),
    compactKeyPart(args.model),
    compactKeyPart(args.submodel),
    compactKeyPart(args.engine),
    compactKeyPart(args.drivetrain),
    compactKeyPart(args.transmission),
    compactKeyPart(args.title || "repair"),
  ].join("::");
}

export function completedNetQuantity(consumed: unknown, returned: unknown): number {
  const toNonNegative = (value: unknown): number => {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : 0;
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  return Math.max(0, toNonNegative(consumed) - toNonNegative(returned));
}

export function resolveCompletedRepairSubtotal(args: {
  useFinalPricing: boolean;
  snapshotPartsTotal: number | null;
  partsTotal: number | null;
  laborTotal: number | null;
}): number | null {
  if (!args.useFinalPricing) return null;

  const partsTotal =
    typeof args.partsTotal === "number" && Number.isFinite(args.partsTotal)
      ? Math.max(0, args.partsTotal)
      : typeof args.snapshotPartsTotal === "number" &&
          Number.isFinite(args.snapshotPartsTotal)
        ? Math.max(0, args.snapshotPartsTotal)
        : 0;
  const laborTotal =
    typeof args.laborTotal === "number" && Number.isFinite(args.laborTotal)
      ? Math.max(0, args.laborTotal)
      : 0;
  return partsTotal + laborTotal;
}

type VehicleMatchInput = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
};

/**
 * Learned repairs are vehicle history, not a generic service catalog. A suggestion
 * therefore requires an exact YMM match. More specific powertrain fields are also
 * treated as compatibility constraints when both sides know the value.
 */
export function matchesCompletedRepairVehicle(
  requested: VehicleMatchInput | null | undefined,
  candidate: VehicleMatchInput | null | undefined,
): boolean {
  const requestedYear = normalizedVehicleYear(requested?.year);
  const candidateYear = normalizedVehicleYear(candidate?.year);
  const requestedMake = normalizedVehicleText(requested?.make);
  const candidateMake = normalizedVehicleText(candidate?.make);
  const requestedModel = normalizedVehicleText(requested?.model);
  const candidateModel = normalizedVehicleText(candidate?.model);

  if (
    requestedYear == null ||
    candidateYear == null ||
    !requestedMake ||
    !candidateMake ||
    !requestedModel ||
    !candidateModel
  ) {
    return false;
  }

  if (
    requestedYear !== candidateYear ||
    requestedMake !== candidateMake ||
    requestedModel !== candidateModel
  ) {
    return false;
  }

  const optionalFields = ["engine", "drivetrain", "transmission"] as const;
  return optionalFields.every((field) => {
    const requestedValue = normalizedVehicleText(requested?.[field]);
    const candidateValue = normalizedVehicleText(candidate?.[field]);
    return !requestedValue || !candidateValue || requestedValue === candidateValue;
  });
}
