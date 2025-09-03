// Shared inspection/quote types used across UI, API and PDF

/* ===================== Inspection ===================== */

export type InspectionItemStatus = "ok" | "fail" | "na" | "recommend";

/** One inspection line item */
export interface InspectionItem {
  /** Primary label (e.g., "Brake pads") */
  item: string;
  /** Optional alternate label some components use */
  name?: string;

  status?: InspectionItemStatus;
  notes?: string;

  /** Optional numeric/typed value (e.g., tread depth) */
  value?: string | number | null;
  unit?: string | null;

  photoUrls?: string[];
}

/** Section of an inspection (e.g., “Brakes”) */
export interface InspectionCategory {
  title: string;
  items: InspectionItem[];
}

/** Alias used by some components */
export type InspectionSection = InspectionCategory;

/** Lightweight session model kept in client state */
export interface InspectionSession {
  id?: string;

  // linking
  customerId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;

  // template context
  templateId?: string | null;
  templateName?: string | null;

  // UI/session state
  location?: string | null;
  currentSectionIndex?: number;
  currentItemIndex?: number;
  transcript?: string;
  status?: "not_started" | "in_progress" | "paused" | "completed";
  started?: boolean;
  completed?: boolean;
  isListening?: boolean;
  isPaused?: boolean;
  lastUpdated?: string;

  // optional rich entities used by your summary page UI
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    province?: string;
    postal_code?: string;
  } | null;

  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    vin?: string | null;
    license_plate?: string | null;
    mileage?: string | number | null;
    color?: string | null;
    id?: string | null;
  } | null;

  sections: InspectionCategory[];

  /** Quote attached to this session (UI/store/PDF shape) */
  quote?: QuoteLineItem[];
}

/* ======================= Axle / Brake ======================= */

export type BrakeType = "air" | "hydraulic";

/* ======================== Quotes ======================== */
/**
 * AI output / generator output used in summary page before normalization.
 * Keep this minimal and stable.
 */
export interface QuoteLine {
  description: string;          // e.g., "Replace front pads/rotors"
  qty?: number;                 // optional quantity
  hours?: number;               // labor hours (can be undefined)
  rate?: number;                // hourly rate (can be undefined)
  unitPrice?: number | null;    // optional, when a single unit price is known
}

/**
 * App/store/PDF quote line. This matches how your UI constructs items
 * and what `generateQuotePDFBytes` expects after normalization.
 */
export interface QuoteLineItem {
  id: string;

  /** Display label(s) used by UI and PDF */
  item?: string;                // alias some code sets
  name: string;
  description: string;

  /** Optional details and annotations */
  status?: InspectionItemStatus; // usually "fail" for recommended repairs
  notes?: string;

  /** Pricing */
  laborHours?: number | null;
  /** Final line price (labor + parts, if you pre-compute it); optional */
  price?: number | null;

  /** Optional structured part line (preferred) */
  part?: { name: string; price: number } | undefined;

  /** Back-compat fields some code paths set instead of `part` */
  partName?: string;            // allow present or empty string
  partPrice?: number | null;    // allow null during construction

  /** Photos tied to the quote line */
  photoUrls?: string[];
}