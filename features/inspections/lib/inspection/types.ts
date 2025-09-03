// features/inspections/lib/inspection/types.ts

/** --- Item / Section core ------------------------------------------------- */
export type InspectionItemStatus = "ok" | "fail" | "na" | "recommend";

export interface InspectionItem {
  /** Primary display label (newer code uses `item`; some legacy uses `name`) */
  item: string;
  name?: string; // legacy alias

  status?: InspectionItemStatus;

  /** Some places wrote `note`, others `notes` — keep both for compatibility */
  notes?: string;
  note?: string;

  value?: string | number | null;
  unit?: string | null;
  photoUrls?: string[];
}

export interface InspectionCategory {
  /** Optional id for lists that key on an id */
  id?: string;
  title: string;
  items: InspectionItem[];
}

/** Alias many files import */
export type InspectionSection = InspectionCategory;

/** Air vs hydraulic (used by axle presets) */
export type BrakeType = "air" | "hydraulic";

/** --- Quote models --------------------------------------------------------- */
/** Looser shape returned by AI/normalizers */
export interface QuoteLine {
  description: string;
  qty?: number;
  hours?: number | null;       // sometimes used instead of laborHours
  total?: number | null;       // sometimes used instead of price
  laborHours?: number | null;  // alt naming
  unitPrice?: number | null;
  partNumber?: string | null;
}

/** Strict UI/store shape for actionable quote items */
export interface QuoteLineItem {
  id: string;

  /** UI prefers `name`; some creators emit `item` */
  name?: string;
  item?: string;

  description?: string;
  notes?: string;

  status?: InspectionItemStatus;
  laborHours?: number;
  price?: number;

  /** Preferred structured part object */
  part?: { name: string; price: number; number?: string };

  /** 🔹 Aliases used by some creators (e.g., normalizeQuoteLine.ts) */
  partName?: string;
  partPrice?: number;

  /** Optional quantity field some generators include */
  qty?: number;

  photoUrls?: string[];
}
/** --- Session side models -------------------------------------------------- */
export interface SessionCustomer {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;
}

export interface SessionVehicle {
  year?: string;
  make?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  mileage?: string;
  color?: string;
}

/** App-wide inspection session model */
export interface InspectionSession {
  id?: string;

  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;

  templateId?: string | null;
  templateName?: string | null;
  location?: string | null;

  // runtime state
  started: boolean;
  completed: boolean;
  isPaused: boolean;
  isListening: boolean;
  status: "not_started" | "in_progress" | "paused" | "completed";
  currentSectionIndex: number;
  currentItemIndex: number;
  transcript: string;
  lastUpdated: string;

  // entities
  customer?: SessionCustomer | null;
  vehicle?: SessionVehicle | null;

  // content
  sections: InspectionCategory[];

  /** Accept both raw AI lines and normalized UI items */
  quote: (QuoteLine | QuoteLineItem)[];
}