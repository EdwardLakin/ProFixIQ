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

export type ParsedInspectionFindingCommand = {
  type: "inspection_finding";
  section?: string;
  item?: string;
  status: InspectionItemStatus;
  note?: string;
  parts?: Array<{ description: string; qty: number }>;
  laborHours?: number | null;
  openPhotoCapture?: boolean;
};

export type VoiceFollowUp =
  | {
      kind: "parts_labor";
      sectionIndex: number;
      itemIndex: number;
      stage: "await_followup" | "await_confirm";
      draft?: {
        laborHours: number | null;
        parts: Array<{ description: string; qty: number }>;
      };
    }
  | {
      kind: "photo_prompt";
      sectionIndex: number;
      itemIndex: number;
    };

export type VoiceMeta = {
  linesAddedToWorkOrder: number;

  /**
   * Voice follow-up state (2-turn flow after fail/recommend).
   * Used by GenericInspectionScreen to:
   *  - arm follow-up after a FAIL/REC + note
   *  - optionally ask for photos
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
    | {
        kind: "photo_prompt";
        sectionIndex: number;
        itemIndex: number;
      }
    | null;
};

export type AppliedTarget = { sectionIndex: number; itemIndex: number };

export type HandleTranscriptResult = {
  appliedTarget: AppliedTarget | null;
};

export interface InspectionItem {
  item?: string;
  name?: string;
  status?: InspectionItemStatus;
  notes?: string;
  note?: string;
  value?: string | number | null;
  unit?: string | null;
  photoUrls?: string[];
  recommend?: string[];
  parts?: Array<{
    description: string;
    qty: number;
  }>;
  laborHours?: number | null;
  estimateSubmitted?: boolean;
  estimateSubmittedAt?: string | null;
  estimateLastUpdatedAt?: string | null;
  estimateWorkOrderLineId?: string | null;
  estimateQuoteLineId?: string | null;
  photoRequested?: boolean;
  photoReviewed?: boolean;
  findingReviewed?: boolean;
  smartMatch?: {
    sourceType?: "history_repair" | "catalog_menu" | null;
    label?: string | null;
    menuItemId?: string | null;
    menuRepairItemId?: string | null;
    laborHours?: number | null;
    parts?: Array<{ name: string; qty?: number }>;
    pricingStatus?: string | null;
    pricingValidUntil?: string | null;
    confidence?: number | null;
  } | null;
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

export type InspectionSection = InspectionCategory;

/** ---------- Parsed voice/AI commands ---------- */
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

export type ParsedCommand =
  | ParsedCommandNameBased
  | ParsedCommandIndexed
  | ParsedInspectionFindingCommand;

export type InspectionCommand =
  | ParsedCommandNameBased
  | { type: "pause"; section?: string; item?: string };

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

export type QuoteSource = "inspection" | "manual" | string;

export interface QuoteLine {
  description: string;
  id?: string;
  source?: QuoteSource;
  item?: string;
  name?: string;
  inspectionItem?: string;
  status?: InspectionItemStatus;
  notes?: string;
  hours?: number;
  rate?: number;
  total?: number;
  laborHours?: number | null;
  laborTime?: number;
  laborRate?: number;
  parts?: Array<{
    name?: string;
    number?: string;
    price?: number;
    type?: string;
  }>;
  partNumber?: string | null;
  partName?: string;
  unitPrice?: number | null;
  qty?: number;
  price?: number;
  totalCost?: number;
}

export interface QuoteLineItem {
  id: string;
  item?: string;
  name?: string;
  description: string;
  status: InspectionItemStatus;
  notes?: string;
  price: number;
  laborHours?: number;
  laborTime?: number;
  laborRate?: number;
  value?: string | number | null;
  part?: { name: string; price: number };
  partName?: string;
  partPrice?: number | null;
  qty?: number;
  unitPrice?: number | null;
  photoUrls?: string[];
  editable?: boolean;
  source?: QuoteSource;
  parts?: Array<{ name?: string; number?: string; price?: number }>;
  totalCost?: number;
  inspectionItem?: string;
  ai?: {
    summary: string;
    confidence?: string;
    parts?: { name: string; qty?: number; cost?: number; notes?: string }[];
  };
  aiState?: "idle" | "loading" | "done" | "error";
}

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

export interface SessionCustomer {
  business_name?: string | null;
  name?: string | null;
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
  unit_number?: string | null;
  engine_hours?: string | null;
  engine?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
  drivetrain?: string | null;
}

export type InspectionStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed";

export interface InspectionSession {
  id?: string;
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  templateitem?: string | null;
  brakeType?: BrakeType;
  location?: string | null;
  currentSectionIndex: number;
  currentItemIndex: number;
  transcript?: string;
  isListening: boolean;
  voiceTrace?: VoiceTraceEvent[];
  voiceMeta?: VoiceMeta;
  status: InspectionStatus;
  started: boolean;
  completed: boolean;
  isPaused: boolean;
  lastUpdated?: string;
  syncRevision?: number;
  serverUpdatedAt?: string | null;
  customer?: SessionCustomer | null;
  vehicle?: SessionVehicle | null;
  sections: InspectionCategory[];
  quote?: Array<QuoteLine | QuoteLineItem>;
}
