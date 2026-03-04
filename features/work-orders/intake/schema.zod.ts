import { z } from "zod";
import { normalizeDtcCode, clampNumber, trimOrNull } from "./utils/sanitize";

const ISOish = z.string().min(4);

export const IntakeV1Schema = z
  .object({
    version: z.literal("1.0"),

    subject: z.object({
      customer_id: z.string().min(1),
      contact_id: z.string().min(1).nullable().optional(),
      vehicle_id: z.string().min(1),
      unit_number: z.string().nullable().optional(),
      odometer_km: z.number().nonnegative().nullable().optional(),
      engine_hours: z.number().nonnegative().nullable().optional(),
    }),

    concern: z.object({
      primary_text: z.string().min(1),
      additional_text: z.string().nullable().optional(),
      started_at: ISOish.nullable().optional(),
      happened_before: z.boolean().nullable().optional(),
      recent_work: z.string().nullable().optional(),
    }),

    duplication: z.object({
      duplicable: z.enum(["yes", "no", "unsure"]),
      conditions: z
        .object({
          temperature: z
            .array(z.enum(["cold", "hot", "after_sitting", "during_regen"]))
            .nullable()
            .optional(),
          driving_state: z
            .array(
              z.enum([
                "idle",
                "accel",
                "decel",
                "cruise",
                "under_load",
                "braking",
                "turning",
              ]),
            )
            .nullable()
            .optional(),
          speed_kph_min: z.number().nonnegative().nullable().optional(),
          speed_kph_max: z.number().nonnegative().nullable().optional(),
          frequency: z
            .enum(["every_time", "most_times", "occasionally", "once"])
            .nullable()
            .optional(),
          notes: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      last_occurred_at: ISOish.nullable().optional(),
    }),

    symptoms: z.object({
      primary_system: z.enum([
        "engine",
        "aftertreatment",
        "transmission",
        "drivetrain",
        "brakes",
        "suspension_steering",
        "electrical",
        "hvac",
        "tires_wheels",
        "body_chassis",
        "pm_service",
        "inspection_only",
        "other",
      ]),
      types: z
        .array(
          z.enum([
            "warning_light",
            "fault_code",
            "noise",
            "vibration",
            "leak",
            "performance",
            "starting",
            "overheating",
            "fuel_economy",
            "visual_damage",
            "other",
          ]),
        )
        .min(1),
      warning_indicators: z
        .object({
          mil: z.boolean().nullable().optional(),
          abs: z.boolean().nullable().optional(),
          def: z.boolean().nullable().optional(),
          dpf: z.boolean().nullable().optional(),
          oil_pressure: z.boolean().nullable().optional(),
          battery: z.boolean().nullable().optional(),
          other_text: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      dtcs: z
        .array(
          z.object({
            code: z.string().min(1),
            description: z.string().nullable().optional(),
          }),
        )
        .nullable()
        .optional(),
    }),

    operating_conditions: z
      .object({
        environment: z
          .array(
            z.enum([
              "city",
              "highway",
              "gravel",
              "off_road",
              "extreme_cold",
              "extreme_heat",
            ]),
          )
          .nullable()
          .optional(),
        occurs_when: z
          .array(
            z.enum([
              "cold_start",
              "hot",
              "under_load",
              "highway_speed",
              "idle",
              "braking",
              "turning",
            ]),
          )
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),

    context: z
      .object({
        recent_events: z
          .array(
            z.enum([
              "breakdown",
              "tow",
              "accident",
              "jump_start",
              "fuel_contamination",
              "regen_event",
            ]),
          )
          .nullable()
          .optional(),
        smells_smoke_sounds: z.string().nullable().optional(),
        parked_extended: z.boolean().nullable().optional(),
        last_service_note: z.string().nullable().optional(),
        previous_recommendations_declined: z.boolean().nullable().optional(),
      })
      .nullable()
      .optional(),

    authorization: z.object({
      diag_authorized: z.boolean(),
      diag_limit_amount: z.number().nonnegative().nullable().optional(),
      contact_before_repairs: z.boolean(),
      repair_limit_amount: z.number().nonnegative().nullable().optional(),
      priority: z.enum(["down_urgent", "can_wait", "scheduled_pm"]),
      preferred_contact: z.enum(["phone", "text", "email", "portal"]).nullable().optional(),
    }),

    attachments: z
      .array(
        z.object({
          id: z.string().min(1),
          kind: z.enum(["photo", "video", "document"]),
          label: z.string().nullable().optional(),
          created_at: ISOish,
        }),
      )
      .nullable()
      .optional(),

    internal_notes: z
      .object({
        advisor_note: z.string().nullable().optional(),
        assigned_tech_id: z.string().nullable().optional(),
        inspection_template_id: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .transform((raw) => {
    const cloned = structuredClone(raw);

    cloned.subject.unit_number = trimOrNull(cloned.subject.unit_number) ?? null;

    cloned.concern.additional_text = trimOrNull(cloned.concern.additional_text) ?? null;
    cloned.concern.recent_work = trimOrNull(cloned.concern.recent_work) ?? null;

    // keep JSON lean: only retain conditions if duplicable=yes
    if (cloned.duplication.duplicable !== "yes") {
      cloned.duplication.conditions = null;
    } else if (cloned.duplication.conditions) {
      const c = cloned.duplication.conditions;
      c.speed_kph_min = clampNumber(c.speed_kph_min, 0, 250);
      c.speed_kph_max = clampNumber(c.speed_kph_max, 0, 250);
      c.notes = trimOrNull(c.notes) ?? null;
    }

    if (cloned.symptoms.dtcs) {
      cloned.symptoms.dtcs = cloned.symptoms.dtcs
        .map((d) => ({
          ...d,
          code: normalizeDtcCode(d.code),
          description: trimOrNull(d.description) ?? null,
        }))
        .filter((d) => d.code.length > 0);
      if (!cloned.symptoms.dtcs.length) cloned.symptoms.dtcs = null;
    }

    if (cloned.symptoms.warning_indicators?.other_text != null) {
      cloned.symptoms.warning_indicators.other_text =
        trimOrNull(cloned.symptoms.warning_indicators.other_text) ?? null;
    }
    if (cloned.context?.smells_smoke_sounds != null) {
      cloned.context.smells_smoke_sounds = trimOrNull(cloned.context.smells_smoke_sounds) ?? null;
    }
    if (cloned.context?.last_service_note != null) {
      cloned.context.last_service_note = trimOrNull(cloned.context.last_service_note) ?? null;
    }
    if (cloned.internal_notes?.advisor_note != null) {
      cloned.internal_notes.advisor_note = trimOrNull(cloned.internal_notes.advisor_note) ?? null;
    }

    return cloned;
  });

export type IntakeV1Parsed = z.infer<typeof IntakeV1Schema>;
