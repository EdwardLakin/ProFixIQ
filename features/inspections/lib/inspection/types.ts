// features/inspections/lib/inspection/types.ts

export type CommandType =
  | ""
  | "ok"
  | "fail"
  | "na"
  | "add"
  | "recommend"
  | "measurement"
  | "status"
  | "pause";

export type InspectionStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "ready_for_review";

export type InspectionItemStatus = "" | "ok" | "fail" | "na" | "recommend";
export type BrakeType = "air" | "hydraulic" | "none";

/* ---------- Commands ---------- */

export interface InspectionCommandBase {
  type: CommandType;
  section?: string;
  item?: string;
}

export interface AddCommand extends InspectionCommandBase {
  type: "add";
  note: string;
}

export interface RecommendCommand extends InspectionCommandBase {
  type: "recommend";
  note: string;
}

export interface MeasurementCommand extends InspectionCommandBase {
  type: "measurement";
  unit: string;
  value: number;
}

export interface StatusCommand extends InspectionCommandBase {
  type: "status";
  status: InspectionItemStatus;
}

export interface PauseCommand extends InspectionCommandBase {
  type: "pause";
}

export type InspectionCommand =
  | AddCommand
  | RecommendCommand
  | MeasurementCommand
  | StatusCommand
  | PauseCommand;

/* ---------- Entities ---------- */

export interface CustomerInfo {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
}

export interface VehicleInfo {
  id?: string;
  vehicle_id?: string;
  year: string;
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color?: string;
  brake_type?: BrakeType;
}

export interface InspectionItem {
  name: string;
  item: string;
  status?: InspectionItemStatus;
  notes?: string;
  value?: string | number | null;
  unit?: string;
  photoUrls?: string[];
  recommend?: string[];
  axle?: string;
}

export interface InspectionSection {
  title: string;
  items: InspectionItem[];
  status?: InspectionItemStatus;
  notes?: string;
}

export interface InspectionState {
  customer?: {
    name: string;
    phone?: string;
  };
  vehicle?: {
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
    unitNumber?: string;
    mileage?: string;
  };
  sections: InspectionSection[];
  completed?: boolean;
  updatedAt?: string;
}

/* ---------- Templates & Quotes ---------- */

export interface InspectionTemplate {
  templateName: string;
  templateId: string;
  sections: InspectionSection[];
}

export interface QuoteLine {
  id: string;
  inspectionItem?: string;
  item: string;
  description?: string;
  status?: InspectionItemStatus;
  value?: number | string | null;
  notes?: string;
  laborTime?: number;
  laborRate?: number;
  parts?: {
    name: string;
    price: number;
    type: "economy" | "premium" | "oem";
  }[];
  totalCost?: number;
  editable?: boolean;
  source?: "inspection" | "manual" | "ai";
}

/** Used by PDF generation and quote UI */
export interface QuoteLineItem {
  id: string;
  item: string | null;
  name: string;
  description?: string;
  notes?: string;
  status: "fail" | "recommend" | "ok" | "na";
  laborHours?: number;
  price: number; // labor price (or total if that’s how you use it)
  part?: {
    name: string;
    price?: number | null; // optional/nullable so .toFixed() needs a guard
  };
  partPrice?: string | null; // legacy field used in some places
  photoUrls?: string[];
}

/* ---------- Sessions & Summary ---------- */

export interface InspectionSession {
  customer?: CustomerInfo;
  vehicle: VehicleInfo & {
    brakeType?: BrakeType;
    axles?: AxleInspection[];
  };
  id: string;
  vehicleId: string;
  customerId: string;
  workOrderId: string;
  templateId: string;
  templateName: string;
  sections: InspectionSection[];
  currentSectionIndex: number;
  currentItemIndex: number;
  started: boolean;
  completed: boolean;
  isListening: boolean;
  isPaused: boolean;
  transcript: string;
  location: string;
  status: InspectionStatus;
  quote: QuoteLine[];
  lastUpdated: string;
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    updated: Partial<InspectionItem>
  ) => void;
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

export interface SummaryItem {
  section: string;
  item: string;
  status?: InspectionItemStatus;
  note?: string;
  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionSummary {
  templateName: string;
  date: string;
  items: SummaryItem[];
  summaryText: string;
}

export interface InspectionSessionWithIndex extends InspectionSession {
  currentSectionIndex: number;
  currentItemIndex: number;
}

/* ---------- Parser / Command outputs ---------- */

export type ParsedCommand = {
  command:
    | "update_status"
    | "update_value"
    | "add_note"
    | "recommend"
    | "complete_item"
    | "skip_item"
    | "pause_inspection"
    | "finish_inspection";
  section?: string;
  item?: string;
  status?: "ok" | "fail" | "na";
  value?: string;
  unit?: string;
  notes?: string;
  recommend?: string;
  sectionIndex?: number;
  itemIndex?: number;
};

export type AxleInspection = {
  axleLabel: string;
  treadDepthLeft?: number;
  treadDepthRight?: number;
  tirePressureLeft?: number;
  tirePressureRight?: number;
  liningLeft?: number;
  liningRight?: number;
  rotorOrDrum?: string;
  pushRodTravelLeft?: number;
  pushRodTravelRight?: number;
  torque?: number;
  notes?: string;
};

export type Command =
  | {
      type: "update_status";
      status: "ok" | "fail" | "na";
      sectionIndex: number;
      itemIndex: number;
    }
  | {
      type: "update_value";
      value: string;
      unit: string;
      sectionIndex: number;
      itemIndex: number;
    }
  | {
      type: "add_note";
      notes: string;
      sectionIndex: number;
      itemIndex: number;
    }
  | {
      type: "recommend";
      recommendation: string;
      sectionIndex: number;
      itemIndex: number;
    }
  | { type: "complete"; sectionIndex: number; itemIndex: number }
  | { type: "skip"; sectionIndex: number; itemIndex: number }
  | { type: "pause" };

export type InspectionSummaryItem = InspectionItem;