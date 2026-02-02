/** ---------- Item / Section ---------- */
export type InspectionItemStatus = "ok" | "fail" | "na" | "recommend";
export type BrakeType = "air" | "hydraulic";

export type VoiceCommandApplyResult = {
  command: string;
  ok: boolean;
  reason?: string;
};

export type VoiceTraceEvent = {
  id: string;
  ts: number;
  rawFinal: string;
  wakeCommand: string | null;
  parsed: ParsedCommand[];
  applied: VoiceCommandApplyResult[];
};

export type VoiceMeta = {
  linesAddedToWorkOrder: number;

  /**
   * Voice follow-up state (2-turn flow after fail/recommend).
   * Used by GenericInspectionScreen to:
   *  - arm follow-up after a FAIL/REC + note
   *  - parse labor/parts on the next utterance
   *  - require "confirm" to submit
   */
  followUp?:
    | {
        kind: "parts_labor";
        sectionIndex: number;
        itemIndex: number;
        stage: "await_followup" | "await_confirm";
        draft?: {
          laborHours?: number | null;
          parts?: Array<{ description: string; qty: number }>;
        };
      }
    | null;
};

export type AppliedTarget = { sectionIndex: number; itemIndex: number };

export type HandleTranscriptResult = {
  appliedTarget: AppliedTarget | null;
};

export interface InspectionItem {
  /** Primary label. Some code uses item, some uses name — support both. */
  item?: string;
  name?: string;

  status?: InspectionItemStatus;
  notes?: string;
  /** Some AI/normalizers use singular note. */
  note?: string;

  value?: string | number | null;
  unit?: string | null;

  photoUrls?: string[];
  recommend?: string[];

  /** 🔹 Technician-requested parts for THIS item (no pricing, no SKU/vendor) */
  parts?: Array<{
    description: string;
    qty: number;
  }>;

  /** 🔹 Labor hours for THIS item (rate & pricing handled later) */
  laborHours?: number | null;
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

/** Many places import InspectionSection; keep it as an alias. */
export type InspectionSection = InspectionCategory;

/** ---------- Parsed voice/AI commands (support both shapes) ---------- */
/** Older, name-based command shape used by dispatchCommand/interpreter */
export type ParsedCommandNameBased =
  | {
      type: "status";
      section: string;
      item: string;
      status: InspectionItemStatus;
    }
  | { type: "add"; section: string; item: string; note: string }
  | { type: "recommend"; section: string; item: string; note: string }
  | {
      type: "measurement";
      section: string;
      item: string;
      value: number | string;
      unit?: string;
    };

/** Newer, index-based command shape used by convertParsedCommands.ts */
export type ParsedCommandIndexed = {
  command:
    | "update_status"
    | "update_value"
    | "add_note"
    | "recommend"
    | "complete_item"
    | "skip_item"
    | "pause_inspection"
    | "finish_inspection";
  sectionIndex?: number;
  itemIndex?: number;
  status?: InspectionItemStatus;
  value?: string | number;
  unit?: string;
  notes?: string;
  recommend?: string;
};

/** Unified ParsedCommand covering both shapes */
export type ParsedCommand = ParsedCommandNameBased | ParsedCommandIndexed;

/**
 * Commands consumed by dispatchCommand (older name-based shape),
 * plus a simple "pause" variant used in a few places.
 */
export type InspectionCommand =
  | ParsedCommandNameBased
  | { type: "pause"; section?: string; item?: string };

/** ---------- Runtime command objects (AI → actions) ---------- */
export type Command =
  | {
      type: "update_status";
      sectionIndex: number;
      itemIndex: number;
      status: InspectionItemStatus;
    }
  | {
      type: "update_value";
      sectionIndex: number;
      itemIndex: number;
      value: string | number;
      unit?: string;
    }
  | {
      type: "add_note";
      sectionIndex: number;
      itemIndex: number;
      notes: string;
    }
  | {
      type: "recommend";
      sectionIndex: number;
      itemIndex: number;
      recommendation: string;
    }
  | {
      type: "complete";
      sectionIndex: number;
      itemIndex: number;
    }
  | {
      type: "skip";
      sectionIndex: number;
      itemIndex: number;
    }
  | { type: "pause" }
  | { type: "finish" };

/** ---------- Quote shapes ---------- */
/** Rich source descriptor for where a line came from. */
export type QuoteSource = "inspection" | "manual" | string;

/**
 * Lightweight line produced by AI generators / costing flows.
 * Extended to include fields your costing + menu matching code writes.
 */
export interface QuoteLine {
  /** Core */
  description: string;

  /** IDs / provenance */
  id?: string;
  source?: QuoteSource;

  /** Names used across flows */
  item?: string; // selected service/menu name
  name?: string; // occasional alias
  inspectionItem?: string; // originating inspection item text

  /** Status / notes */
  status?: InspectionItemStatus;
  notes?: string;

  /** Time & rates */
  hours?: number;
  rate?: number;
  total?: number;
  laborHours?: number | null;
  laborTime?: number; // alias used on some screens
  laborRate?: number;

  /** Parts */
  parts?: Array<{
    name?: string;
    number?: string;
    price?: number;
    type?: string;
  }>;
  partNumber?: string | null;
  partName?: string;
  unitPrice?: number | null;

  /** Roll-up / pricing */
  qty?: number;
  price?: number; // some code writes final line price here
  totalCost?: number;
}

/** Detailed line used by PDF/store. */
export interface QuoteLineItem {
  id: string;

  /** Some places map description into both item and name. */
  item?: string;
  name?: string;
  description: string;

  status: InspectionItemStatus;
  notes?: string;

  /** Unified commercial fields */
  price: number; // line price/total
  laborHours?: number;
  /** Additional variants used in some flows */
  laborTime?: number; // alias used on some pages
  laborRate?: number;

  /** Item-level measurement value (rare) */
  value?: string | number | null;

  /** Parts can be object or split fields */
  part?: { name: string; price: number };
  partName?: string;
  partPrice?: number | null;

  /** Old-style fields occasionally present */
  qty?: number;
  unitPrice?: number | null;

  /** Misc UI helpers */
  photoUrls?: string[];
  editable?: boolean;
  source?: QuoteSource;

  /** Collections used by some UIs */
  parts?: Array<{ name?: string; number?: string; price?: number }>;
  totalCost?: number;

  /** Optional back-reference to the inspection item */
  inspectionItem?: string;

  /** Optional AI suggestion metadata */
  ai?: {
    summary: string;
    confidence?: string;
    parts?: { name: string; qty?: number; cost?: number; notes?: string }[];
  };

  /** UI-only: track AI enrichment progress for this line */
  aiState?: "idle" | "loading" | "done" | "error";
}

/** ---------- Inspection Summary ---------- */
export interface SummaryItem {
  section: string;
  item: string;
  status: InspectionItemStatus;
  note?: string;
  value?: string | number | null;
  unit?: string | null;
  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionSummary {
  templateName?: string | null;
  date: string;
  items: SummaryItem[];
  summaryText: string;
}

/** ---------- Session (customer/vehicle) ---------- */
export interface SessionCustomer {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}

export interface SessionVehicle {
  year: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  mileage: string | null;
  color: string | null;
  /** Added for your form */
  unit_number?: string | null;
  engine_hours?: string | null;
}

/** ---------- Session status ---------- */
export type InspectionStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed";

/** ---------- Full session ---------- */
export interface InspectionSession {
  id?: string;

  /** Links to other records */
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;

  /** Template meta */
  templateId?: string | null;
  templateName?: string | null;
  /** Legacy alias still used by some pages */
  templateitem?: string | null;

  /** Selected brake system for rendering/units */
  brakeType?: BrakeType;

  location?: string | null;

  /** Progress */
  currentSectionIndex: number;
  currentItemIndex: number;

  /** Voice */
  transcript?: string;
  isListening: boolean;
  voiceTrace?: VoiceTraceEvent[];
  voiceMeta?: VoiceMeta;

  /** Lifecycle */
  status: InspectionStatus;
  started: boolean;
  completed: boolean;
  isPaused: boolean;

  /** Audit */
  lastUpdated?: string;

  /** Entities */
  customer?: SessionCustomer | null;
  vehicle?: SessionVehicle | null;

  /** Content */
  sections: InspectionCategory[];

  /** Quotes can be DB-sourced or UI-generated — accept both */
  quote?: Array<QuoteLine | QuoteLineItem>;
}