type VehicleType = "car" | "truck" | "bus" | "trailer" | null;
type DutyClass = "light" | "medium" | "heavy" | null;
type BrakeMode = "air" | "hydraulic" | "unknown";

export type FleetFormProfile = {
  vehicleType: VehicleType;
  dutyClass: DutyClass;
  brakeMode: BrakeMode;
  formKind: string;
  multiPage: boolean;
  hints: string[];
};

function has(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function inferFleetFormProfile(input: {
  extractedText?: string | null;
  originalFilename?: string | null;
  pageCount?: number | null;
}): FleetFormProfile {
  const raw = [
    input.originalFilename ?? "",
    input.extractedText ?? "",
  ].join("\n");

  const text = raw.toLowerCase();

  const vehicleType: VehicleType = has(text, [/\btrailer\b/, /\bsemi[-\s]?trailer\b/, /\bdolly\b/])
    ? "trailer"
    : has(text, [/\bbus\b/, /\bcoach\b/, /\bpassenger compartment\b/, /\bschool bus\b/])
      ? "bus"
      : has(text, [/\btractor\b/, /\btruck\b/, /\bunit number\b/, /\bpower unit\b/])
        ? "truck"
        : has(text, [/\bcar\b/, /\bsuv\b/, /\bpassenger vehicle\b/])
          ? "car"
          : null;

  const brakeMode: BrakeMode = has(text, [/\bair brake\b/, /\bslack adjuster\b/, /\bpush rod\b/, /\bbrake chamber\b/])
    ? "air"
    : has(text, [/\bhydraulic\b/, /\bbrake fluid\b/, /\brotor\b/, /\bcaliper\b/])
      ? "hydraulic"
      : "unknown";

  const dutyClass: DutyClass =
    vehicleType === "car"
      ? "light"
      : vehicleType === "truck"
        ? has(text, [/\bclass 8\b/, /\btractor\b/, /\bcommercial\b/, /\bair brake\b/]) ? "heavy" : "medium"
        : vehicleType === "bus" || vehicleType === "trailer"
          ? "heavy"
          : null;

  const multiPage = (input.pageCount ?? 1) > 1;

  let formKind = "fleet inspection";
  if (has(text, [/\bpre[-\s]?trip\b/, /\bdvir\b/])) formKind = "pre-trip inspection";
  else if (has(text, [/\bcertificate of inspection\b/, /\bcvip\b/])) formKind = "regulated inspection";
  else if (has(text, [/\btractor\b/])) formKind = "tractor inspection";
  else if (has(text, [/\btrailer\b/])) formKind = "trailer inspection";

  const hints: string[] = [];
  if (vehicleType) hints.push(`vehicle:${vehicleType}`);
  if (dutyClass) hints.push(`duty:${dutyClass}`);
  hints.push(`brakes:${brakeMode}`);
  if (multiPage) hints.push("multi-page");

  return {
    vehicleType,
    dutyClass,
    brakeMode,
    formKind,
    multiPage,
    hints,
  };
}
