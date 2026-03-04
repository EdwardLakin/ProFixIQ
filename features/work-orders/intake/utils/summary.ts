import type { IntakeV1 } from "../types";

const systemLabel: Record<IntakeV1["symptoms"]["primary_system"], string> = {
  engine: "Engine",
  aftertreatment: "Aftertreatment",
  transmission: "Transmission",
  drivetrain: "Drivetrain",
  brakes: "Brakes",
  suspension_steering: "Suspension/Steering",
  electrical: "Electrical",
  hvac: "HVAC",
  tires_wheels: "Tires/Wheels",
  body_chassis: "Body/Chassis",
  pm_service: "PM Service",
  inspection_only: "Inspection Only",
  other: "Other",
};

const typeLabel: Record<IntakeV1["symptoms"]["types"][number], string> = {
  warning_light: "Warning light",
  fault_code: "Fault code",
  noise: "Noise",
  vibration: "Vibration",
  leak: "Leak",
  performance: "Performance",
  starting: "Starting",
  overheating: "Overheating",
  fuel_economy: "Fuel economy",
  visual_damage: "Visual damage",
  other: "Other",
};

export function buildTechSummary(intake: IntakeV1): {
  title: string;
  chips: string[];
  dtcs: string[];
  concernText: string;
  duplicationLine: string;
} {
  const chips: string[] = [];

  chips.push(systemLabel[intake.symptoms.primary_system]);
  intake.symptoms.types.slice(0, 4).forEach((t) => chips.push(typeLabel[t]));

  let duplicationLine = "Duplication: Unsure";
  if (intake.duplication.duplicable === "yes") duplicationLine = "Duplication: Yes";
  if (intake.duplication.duplicable === "no") duplicationLine = "Duplication: No";

  if (intake.duplication.duplicable === "yes" && intake.duplication.conditions) {
    const c = intake.duplication.conditions;
    const extras: string[] = [];

    if (c.temperature?.length) {
      extras.push(
        ...c.temperature.map((x) => ({
          cold: "Cold",
          hot: "Hot",
          after_sitting: "After sitting",
          during_regen: "During regen",
        })[x]),
      );
    }

    if (c.driving_state?.length) {
      extras.push(
        ...c.driving_state.map((x) => ({
          idle: "Idle",
          accel: "Accel",
          decel: "Decel",
          cruise: "Cruise",
          under_load: "Under load",
          braking: "Braking",
          turning: "Turning",
        })[x]),
      );
    }

    if (c.speed_kph_min != null || c.speed_kph_max != null) {
      const min = c.speed_kph_min ?? 0;
      const max = c.speed_kph_max ?? min;
      extras.push(`${min}-${max} km/h`);
    }

    if (c.frequency) {
      extras.push(
        {
          every_time: "Every time",
          most_times: "Most times",
          occasionally: "Occasionally",
          once: "Once",
        }[c.frequency],
      );
    }

    if (extras.length) duplicationLine += ` • ${extras.slice(0, 5).join(", ")}`;
  }

  const dtcs = (intake.symptoms.dtcs ?? [])
    .map((d) => d.code)
    .filter(Boolean)
    .slice(0, 8);

  const title =
    intake.concern.primary_text.length > 60
      ? intake.concern.primary_text.slice(0, 57) + "…"
      : intake.concern.primary_text;

  return {
    title: title || "Work order intake",
    chips,
    dtcs,
    concernText: intake.concern.primary_text,
    duplicationLine,
  };
}
