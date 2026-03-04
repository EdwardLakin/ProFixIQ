export type IntakeV1 = {
  version: "1.0";

  subject: {
    customer_id: string;
    contact_id?: string | null;
    vehicle_id: string;
    unit_number?: string | null;
    odometer_km?: number | null;
    engine_hours?: number | null;
  };

  concern: {
    primary_text: string;
    additional_text?: string | null;
    started_at?: string | null; // ISO date/datetime
    happened_before?: boolean | null;
    recent_work?: string | null;
  };

  duplication: {
    duplicable: "yes" | "no" | "unsure";
    conditions?: {
      temperature?: Array<"cold" | "hot" | "after_sitting" | "during_regen"> | null;
      driving_state?: Array<
        "idle" | "accel" | "decel" | "cruise" | "under_load" | "braking" | "turning"
      > | null;
      speed_kph_min?: number | null;
      speed_kph_max?: number | null;
      frequency?: "every_time" | "most_times" | "occasionally" | "once" | null;
      notes?: string | null;
    } | null;
    last_occurred_at?: string | null;
  };

  symptoms: {
    primary_system:
      | "engine"
      | "aftertreatment"
      | "transmission"
      | "drivetrain"
      | "brakes"
      | "suspension_steering"
      | "electrical"
      | "hvac"
      | "tires_wheels"
      | "body_chassis"
      | "pm_service"
      | "inspection_only"
      | "other";
    types: Array<
      | "warning_light"
      | "fault_code"
      | "noise"
      | "vibration"
      | "leak"
      | "performance"
      | "starting"
      | "overheating"
      | "fuel_economy"
      | "visual_damage"
      | "other"
    >;
    warning_indicators?: {
      mil?: boolean | null;
      abs?: boolean | null;
      def?: boolean | null;
      dpf?: boolean | null;
      oil_pressure?: boolean | null;
      battery?: boolean | null;
      other_text?: string | null;
    } | null;
    dtcs?: Array<{ code: string; description?: string | null }> | null;
  };

  operating_conditions?: {
    environment?: Array<
      "city" | "highway" | "gravel" | "off_road" | "extreme_cold" | "extreme_heat"
    > | null;
    occurs_when?: Array<
      "cold_start" | "hot" | "under_load" | "highway_speed" | "idle" | "braking" | "turning"
    > | null;
  } | null;

  context?: {
    recent_events?: Array<
      "breakdown" | "tow" | "accident" | "jump_start" | "fuel_contamination" | "regen_event"
    > | null;
    smells_smoke_sounds?: string | null;
    parked_extended?: boolean | null;
    last_service_note?: string | null;
    previous_recommendations_declined?: boolean | null;
  } | null;

  authorization: {
    diag_authorized: boolean;
    diag_limit_amount?: number | null;
    contact_before_repairs: boolean;
    repair_limit_amount?: number | null;
    priority: "down_urgent" | "can_wait" | "scheduled_pm";
    preferred_contact?: "phone" | "text" | "email" | "portal" | null;
  };

  attachments?: Array<{
    id: string;
    kind: "photo" | "video" | "document";
    label?: string | null;
    created_at: string; // ISO
  }> | null;

  internal_notes?: {
    advisor_note?: string | null;
    assigned_tech_id?: string | null;
    inspection_template_id?: string | null;
  } | null;
};

export type IntakeMode = "portal" | "app" | "fleet";
