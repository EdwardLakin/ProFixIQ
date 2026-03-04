import type { IntakeV1 } from "./types";

export function makeIntakeDefaults(params: {
  customer_id: string;
  vehicle_id: string;
  contact_id?: string | null;
  preferred_contact?: "phone" | "text" | "email" | "portal" | null;
}): IntakeV1 {
  return {
    version: "1.0",
    subject: {
      customer_id: params.customer_id,
      vehicle_id: params.vehicle_id,
      contact_id: params.contact_id ?? null,
      unit_number: null,
      odometer_km: null,
      engine_hours: null,
    },
    concern: {
      primary_text: "",
      additional_text: null,
      started_at: null,
      happened_before: null,
      recent_work: null,
    },
    duplication: {
      duplicable: "unsure",
      conditions: null,
      last_occurred_at: null,
    },
    symptoms: {
      primary_system: "other",
      types: ["other"],
      warning_indicators: null,
      dtcs: null,
    },
    operating_conditions: null,
    context: null,
    authorization: {
      diag_authorized: true,
      diag_limit_amount: null,
      contact_before_repairs: true,
      repair_limit_amount: null,
      priority: "can_wait",
      preferred_contact: params.preferred_contact ?? null,
    },
    attachments: null,
    internal_notes: null,
  };
}
