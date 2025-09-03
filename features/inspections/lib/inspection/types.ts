// features/inspections/lib/inspection/types.ts

/** ---------- Item / Section ---------- */
export type InspectionItemStatus = "ok" | "fail" | "na" | "recommend";

export interface InspectionItem {
  /** Primary label. Some code uses `item`, some uses `name` — support both. */
  item?: string;
  name?: string;

  status?: InspectionItemStatus;
  notes?: string;
  /** Some AI/normalizers use singular `note`. */
  note?: string;

  value?: string | number | null;
  unit?: string | null;

  photoUrls?: string[];
  recommend?: string[];
}

export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

/** Many places import `InspectionSection`; keep it as an alias. */
export type InspectionSection = InspectionCategory;

/** ---------- Parsed voice commands ---------- */
export type ParsedCommand =
  | { type: "status"; section: string; item: string; status: InspectionItemStatus }
  | { type: "add"; section: string; item: string; note: string }
  | { type: "recommend"; section: string; item: string; note: string }
  | { type: "measurement"; section: string; item: string; value: number | string; unit?: string };

/** ---------- Quote shapes ---------- */
/** Lightweight line produced by AI generators (flexible & optional fields). */
export interface QuoteLine {
  description: string;

  /** Newer generator fields */
  hours?: number;
  rate?: number;
  total?: number;

  /** Older fields still referenced in a few places */
  qty?: number;
  laborHours?: number | null;
  partNumber?: string | null;
  unitPrice?: number | null;
}

/** Rich line used by PDF and store. Kept broad to accept all callsites. */
export type QuoteSource = "inspection" | "manual" | string;

export interface QuoteLineItem {
  id: string;

  /** Some places map description into both `item` and `name`. */
  item?: string;
  name?: string;
  description: string;

  status: InspectionItemStatus;
  notes?: string;

  /** Unified commercial fields */
  price: number;              // line price/total
  laborHours?: number;
  /** Additional variants used in some flows */
  laborTime?: number;         // alias used on some pages
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
}

/** ---------- Session (customer/vehicle) ---------- */
export interface SessionCustomer {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
}

export interface SessionVehicle {
  year: string;
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color: string;
}

/** ---------- Session status ---------- */
export type InspectionStatus = "not_started" | "in_progress" | "paused" | "completed";

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

  location?: string | null;

  /** Progress */
  currentSectionIndex: number;
  currentItemIndex: number;

  /** Voice */
  transcript?: string;
  isListening: boolean;

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

/** ---------- Brake / Axle helpers ---------- */
export type BrakeType = "air" | "hydraulic";