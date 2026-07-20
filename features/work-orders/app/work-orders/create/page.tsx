
// /features/work-orders/app/work-orders/create/page.tsx (FULL FILE REPLACEMENT)
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";
import { toast } from "sonner";

import VinCaptureModal from "app/vehicle/VinCaptureModal";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import { useCustomerVehicleDraft } from "app/work-orders/state/useCustomerVehicleDraft";

import CreateFlowMaintenanceSelector from "@/features/maintenance/components/CreateFlowMaintenanceSelector";
// UI
import CustomerVehicleForm from "@/features/inspections/components/inspection/CustomerVehicleForm";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";
import { AiSuggestModal } from "@work-orders/components/AiSuggestModal";

// Session types
import type {
  SessionCustomer,
  SessionVehicle,
} from "@/features/inspections/lib/inspection/types";
import { normalizeCustomerForIntake } from "@/features/inspections/lib/customerNormalization";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import { checkVehicleDuplicates } from "@/features/shared/lib/vehicles/duplicateCheck";

// 👇 inspection modal, client-only
const InspectionModal = dynamic(
  () => import("@/features/inspections/components/InspectionModal"),
  { ssr: false },
);

/* =============================================================================
   Theme constants (match quote-review)
============================================================================= */
const COPPER = "#C57A4A";

const card =
  "rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
const divider = "border-[color:var(--desktop-border)]";
const sectionPanel =
  "rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 shadow-[var(--theme-shadow-medium)] sm:p-5";
const childPanel =
  "rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
const subtlePanel =
  "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]";
const softButton =
  "rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]";

/* =============================================================================
   Types & helpers
============================================================================= */
type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type LineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderLine = LineRow;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

// Allow a couple extra fields used by UI/drafts without using `any`
type CustomerWithBusiness = SessionCustomer & { business_name?: string | null };
type VehicleWithExtra = SessionVehicle & {
  engine?: string | null;
  submodel?: string | null;
  engine_family?: string | null;
  engine_type?: string | null;
  fuel_type?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  transmission_type?: string | null;
};

type WorkOrderWaiterRow = WorkOrderRow & { is_waiter?: boolean | null };

// ✅ VIN decode payload can be string/number, but we normalize before storing
type VinDecoded = {
  vin: string;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  submodel?: string | null;
  engine?: string | null;
  engineFamily?: string | null;
  engineType?: string | null;
  fuelType?: string | null;
  driveType?: string | null;
  transmission?: string | null;
  transmissionType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  gvwr?: string | null;
};

type CustomerRowWithBusiness = CustomerRow & { business_name?: string | null };

type CreateWoRpcRow = Pick<
  WorkOrderRow,
  "id" | "shop_id" | "custom_id" | "customer_id" | "vehicle_id" | "advisor_id"
> & {
  is_waiter?: boolean | null;
};

type BookingConversionRow = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  | "id"
  | "shop_id"
  | "customer_id"
  | "vehicle_id"
  | "work_order_id"
  | "status"
  | "notes"
  | "starts_at"
  | "ends_at"
>;

// Type the draft hooks once so we don't need `any` where the hook typing is loose
type CustomerVehicleDraftHook = {
  customer?: Partial<CustomerWithBusiness>;
  vehicle?: Partial<VehicleWithExtra> & { plate?: string | null };

  setCustomerField: (
    field: keyof SessionCustomer | "business_name",
    value: string | null,
  ) => void;

  // ✅ allow extra vehicle fields to persist in the draft
  setVehicleField: (field: keyof VehicleWithExtra, value: string | null) => void;

  bulkSet: (data: {
    customer?: Partial<CustomerWithBusiness>;
    vehicle?: Partial<VehicleWithExtra>;
  }) => void;

  reset: () => void;
};

type WorkOrderDraftHook = {
  customer?: Partial<SessionCustomer>;
  vehicle?: Partial<VehicleWithExtra> & {
    license_plate?: string | null;
    plate?: string | null;
  };
  setVehicle: (vehicle: Partial<VehicleWithExtra>) => void;
  reset: () => void;
};

// Extended line type so we can read template metadata safely
type WorkOrderLineWithInspectionMeta = LineRow & {
  inspection_template?: string | null;
  inspectionTemplate?: string | null;
  template?: string | null;
  inspection_template_id?: string | null;
  metadata?:
    | {
        inspection_template_id?: string | null;
        inspection_template?: string | null;
        template?: string | null;
        [key: string]: unknown;
      }
    | null;
};

const getStrField = (obj: unknown, key: string): string | null => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number") return String(v);
    if (v == null) return null;
  }
  return null;
};

const getMetaString = (meta: unknown, key: string): string | null => {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

// Intake helpers (stored into work_orders.notes without schema changes)
function buildIntakeNotesBlock(input: {
  concern: string;
  details: string;
  contactPref: string;
  mileage: string;
}) {
  const lines: string[] = [];
  lines.push("PORTAL INTAKE"); // keep marker consistent across portal + app
  lines.push(`Concern: ${input.concern.trim()}`);
  if (input.details.trim()) lines.push(`Details: ${input.details.trim()}`);
  if (input.contactPref.trim()) lines.push(`Contact: ${input.contactPref.trim()}`);
  if (input.mileage.trim()) lines.push(`Mileage: ${input.mileage.trim()}`);
  return lines.join("\n");
}

function mergeNotes(existing: string | null | undefined, intakeBlock: string) {
  const base = (existing ?? "").trim();
  const marker = "PORTAL INTAKE";
  if (!base) return intakeBlock;

  const idx = base.indexOf(marker);
  if (idx >= 0) {
    const before = base.slice(0, idx).trimEnd();
    return before ? `${before}\n\n${intakeBlock}` : intakeBlock;
  }
  return `${base}\n\n${intakeBlock}`;
}

const INTAKE_DISMISS_KEY = "pfq.create.intake.dismiss.v1";

const strOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

const normalizedVinOrNull = (v: string | null | undefined) => {
  const raw = strOrNull(v);
  if (!raw) return null;
  return normalizeVinInput(raw).vin || null;
};

const validVinOrNull = (v: string | null | undefined) => {
  const raw = strOrNull(v);
  if (!raw) return null;
  const normalized = normalizeVinInput(raw);
  return normalized.isValid ? normalized.vin : null;
};

const normalizeEmail = (v: string | null | undefined): string | null => {
  const email = strOrNull(v);
  return email ? email.toLowerCase() : null;
};

const normalizePhone = (v: string | null | undefined): string | null => {
  const raw = strOrNull(v);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
};

const numOrNull = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ✅ normalize year into SessionVehicle.year (string|null)
const yearToStrOrNull = (
  v: string | number | null | undefined,
): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

function validateVehicleSaveInput(vehicle: VehicleWithExtra): void {
  const vin = strOrNull(vehicle.vin);
  if (vin && !normalizeVinInput(vin).isValid) {
    throw new Error("VIN must be a valid 17-character VIN before saving.");
  }

  const yearText = yearToStrOrNull(vehicle.year);
  const year = numOrNull(vehicle.year);
  const maximumYear = new Date().getFullYear() + 2;
  if (
    yearText &&
    (year === null || !Number.isInteger(year) || year < 1886 || year > maximumYear)
  ) {
    throw new Error(`Year must be between 1886 and ${maximumYear}.`);
  }

  const engineHoursText = strOrNull(vehicle.engine_hours);
  const engineHours = numOrNull(vehicle.engine_hours);
  if (engineHoursText && (engineHours === null || engineHours < 0)) {
    throw new Error("Engine hours must be a positive number.");
  }
}

function assertWritePersisted(
  entity: "customer" | "vehicle",
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): void {
  const comparable = (value: unknown) =>
    value === null || value === undefined || String(value).trim() === ""
      ? null
      : String(value).trim();
  const mismatched = Object.entries(expected)
    .filter(([key]) => key !== "shop_id")
    .filter(([key, value]) => comparable(actual[key]) !== comparable(value))
    .map(([key]) => key);
  if (mismatched.length) {
    throw new Error(
      `${entity === "customer" ? "Customer" : "Vehicle"} fields did not save: ${mismatched.join(", ")}. Please try again.`,
    );
  }
}

function toDatetimeLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDatetimeLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatBookingWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  return `${start.toLocaleString()} – ${end.toLocaleTimeString()}`;
}

function buildBookingNotesBlock(booking: BookingConversionRow): string {
  const lines = ["APPOINTMENT HANDOFF"];
  const windowLabel = formatBookingWindow(booking.starts_at, booking.ends_at);
  if (windowLabel) lines.push(`Scheduled: ${windowLabel}`);
  if (booking.notes?.trim()) lines.push(`Appointment notes: ${booking.notes.trim()}`);
  return lines.join("\n");
}

function hydrateVehicleFromRow(row: VehicleRow): VehicleWithExtra {
  return {
    vin: row.vin ?? null,
    year: row.year != null ? String(row.year) : null,
    make: row.make ?? null,
    model: row.model ?? null,
    license_plate: row.license_plate ?? null,
    mileage: getStrField(row, "mileage"),
    unit_number: getStrField(row, "unit_number"),
    color: getStrField(row, "color"),
    engine_hours: row.engine_hours != null ? String(row.engine_hours) : null,
    engine: getStrField(row, "engine"),
    submodel: getStrField(row, "submodel"),
    engine_family: getStrField(row, "engine_family"),
    engine_type: getStrField(row, "engine_type"),
    transmission: getStrField(row, "transmission"),
    transmission_type: getStrField(row, "transmission_type"),
    fuel_type: getStrField(row, "fuel_type"),
    drivetrain: getStrField(row, "drivetrain"),
  };
}

/** Normalize “where is the inspection template id stored for this line?” */
function extractInspectionTemplateId(
  ln: WorkOrderLineWithInspectionMeta,
): string | null {
  return (
    ln.inspection_template_id ??
    ln.inspection_template ??
    ln.inspectionTemplate ??
    ln.template ??
    getMetaString(ln.metadata, "inspection_template_id") ??
    getMetaString(ln.metadata, "inspection_template") ??
    getMetaString(ln.metadata, "template") ??
    null
  );
}

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const queryCustomerId =
    searchParams.get("customerId")?.trim() ||
    searchParams.get("customer_id")?.trim() ||
    searchParams.get("customer")?.trim() ||
    null;
  const queryVehicleId =
    searchParams.get("vehicleId")?.trim() ||
    searchParams.get("vehicle_id")?.trim() ||
    searchParams.get("vehicle")?.trim() ||
    null;
  const bookingId = searchParams.get("bookingId")?.trim() || null;
  const returnTo = searchParams.get("returnTo")?.trim() || null;

  useEffect(() => {
    (window as unknown as Record<string, unknown>)._sb = supabase;
  }, [supabase]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(INTAKE_DISMISS_KEY);
      setIntakeDismissed(v === "1");
    } catch {
      /* noop */
    }
  }, []);

  // Prefill ids from URL
  const [prefillVehicleId, setPrefillVehicleId] = useTabState<string | null>(
    "prefillVehicleId",
    null,
  );
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>(
    "prefillCustomerId",
    null,
  );

  // Keep state (not shown in UI now)
  const [, setSourceFlags] = useTabState("__create_sources", {
    queryVehicle: false,
    queryCustomer: false,
    autoWO: false,
  } as {
    queryVehicle: boolean;
    queryCustomer: boolean;
    autoWO: boolean;
  });

  // ✅ memoized defaults to satisfy exhaustive-deps (stable identity)
  const defaultCustomer = useMemo<CustomerWithBusiness>(
    () => ({
      business_name: null,
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      province: null,
      postal_code: null,
    }),
    [],
  );

  const defaultVehicle = useMemo<SessionVehicle>(
    () => ({
      year: null,
      make: null,
      model: null,
      vin: null,
      license_plate: null,
      mileage: null,
      color: null,
      unit_number: null,
      engine_hours: null,
    }),
    [],
  );

  const [customer, setCustomer] = useTabState<CustomerWithBusiness>(
    "__cv_customer",
    defaultCustomer,
  );
  const [vehicle, setVehicle] = useTabState<VehicleWithExtra>(
    "__cv_vehicle",
    defaultVehicle,
  );

  // CV draft (session persisted)
  const cvDraft =
    useCustomerVehicleDraft() as unknown as CustomerVehicleDraftHook;

  // Hydrate from CV draft on first load (only fill empty fields)
  useEffect(() => {
    const d = cvDraft;
    if (!d) return;

    const dc = (d.customer ?? {}) as Partial<CustomerWithBusiness>;
    const dv = (d.vehicle ?? {}) as Partial<VehicleWithExtra> & {
      plate?: string | null;
    };

    const hasDraftCust = Object.values(dc).some(Boolean);
    const hasDraftVeh = Object.values(dv).some(Boolean);

    if (hasDraftCust) {
      setCustomer((prev) => ({
        ...prev,
        business_name:
          (prev.business_name ?? "") !== ""
            ? prev.business_name ?? null
            : (dc.business_name ?? prev.business_name ?? null),
        first_name:
          prev.first_name == null || prev.first_name === ""
            ? (dc.first_name ?? prev.first_name ?? null)
            : prev.first_name,
        last_name:
          prev.last_name == null || prev.last_name === ""
            ? (dc.last_name ?? prev.last_name ?? null)
            : prev.last_name,
        phone:
          prev.phone == null || prev.phone === ""
            ? (dc.phone ?? prev.phone ?? null)
            : prev.phone,
        email:
          prev.email == null || prev.email === ""
            ? (dc.email ?? prev.email ?? null)
            : prev.email,
        address:
          prev.address == null || prev.address === ""
            ? (dc.address ?? prev.address ?? null)
            : prev.address,
        city:
          prev.city == null || prev.city === ""
            ? (dc.city ?? prev.city ?? null)
            : prev.city,
        province:
          prev.province == null || prev.province === ""
            ? (dc.province ?? prev.province ?? null)
            : prev.province,
        postal_code:
          prev.postal_code == null || prev.postal_code === ""
            ? (dc.postal_code ?? prev.postal_code ?? null)
            : prev.postal_code,
      }));
    }

    if (hasDraftVeh) {
      setVehicle((prev) => ({
        ...prev,
        vin: dv.vin ?? prev.vin,
        year: yearToStrOrNull(dv.year ?? prev.year),
        make: dv.make ?? prev.make,
        model: dv.model ?? prev.model,
        license_plate:
          dv.license_plate ?? dv.plate ?? prev.license_plate ?? null,

        mileage: dv.mileage ?? prev.mileage ?? null,
        unit_number: dv.unit_number ?? prev.unit_number ?? null,
        color: dv.color ?? prev.color ?? null,
        engine_hours: dv.engine_hours ?? prev.engine_hours ?? null,

        // ✅ persist extra fields from draft too
        engine: dv.engine ?? prev.engine ?? null,
        submodel: dv.submodel ?? prev.submodel ?? null,
        engine_family: dv.engine_family ?? prev.engine_family ?? null,
        engine_type: dv.engine_type ?? prev.engine_type ?? null,
        transmission: dv.transmission ?? prev.transmission ?? null,
        transmission_type: dv.transmission_type ?? prev.transmission_type ?? null,
        fuel_type: dv.fuel_type ?? prev.fuel_type ?? null,
        drivetrain: dv.drivetrain ?? prev.drivetrain ?? null,
      }));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-time hydration is intentional

  const onCustomerChange = useCallback(
    (field: keyof SessionCustomer | "business_name", value: string | null) => {
      setCustomer((c) => ({ ...c, [field]: value }));
      cvDraft.setCustomerField(field, value);
    },
    [cvDraft, setCustomer],
  );

  // ✅ allow extra vehicle fields to flow through from the form
  const onVehicleChange = useCallback(
    (field: keyof VehicleWithExtra, value: string | null) => {
      const nextValue = field === "vin" ? normalizedVinOrNull(value) : value;
      setVehicle((v) => ({ ...v, [field]: nextValue }));
      cvDraft.setVehicleField(field, nextValue);
    },
    [cvDraft, setVehicle],
  );

  // Captured ids
  const [customerId, setCustomerId] = useTabState<string | null>(
    "customerId",
    null,
  );
  const [vehicleId, setVehicleId] = useTabState<string | null>(
    "vehicleId",
    null,
  );

  // Work order + lines
  const [wo, setWo] = useTabState<WorkOrderRow | null>("__create_wo", null);
  const [lines, setLines] = useTabState<LineRow[]>("__create_lines", []);

  // ✅ inspection modal state
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // ✅ AI suggest modal state
  const [aiSuggestOpen, setAiSuggestOpen] = useState(false);

  // Soft intake pop (after save)
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeDismissed, setIntakeDismissed] = useState(false);

  const [intakeConcern, setIntakeConcern] = useState("");
  const [intakeDetails, setIntakeDetails] = useState("");
  const [intakeContactPref, setIntakeContactPref] = useState("Text or call");
  const [intakeMileage, setIntakeMileage] = useState("");
  const [intakeSaving, setIntakeSaving] = useState(false);

  // Defaults / notes
  const [type, setType] = useTabState<WOType>("type", "maintenance");
  const [notes, setNotes] = useTabState("notes", "");
  // 👇 work order priority (1 urgent → 4 low). default 3 = normal
  const [priority, setPriority] = useTabState<number>("priority", 3);
  // 👇 waiter flag (customer waiting on-site)
  const [isWaiter, setIsWaiter] = useTabState<boolean>("is_waiter", false);
  const [expectedCompletionInput, setExpectedCompletionInput] = useTabState<string>(
    "expected_completion_input",
    "",
  );

  // Uploads
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // UI state
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError] = useTabState("error", "");
  const [inviteNotice, setInviteNotice] =
    useTabState<string>("inviteNotice", "");
  const [bookingPrefill, setBookingPrefill] = useState<BookingConversionRow | null>(null);
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", true);
  const [selectedMaintenanceCodes, setSelectedMaintenanceCodes] = useState<string[]>([]);

  // Current user id (for VIN modal)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // ✅ advisor ownership tracking
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  // read profile.shop_id early so autocomplete is scoped before WO exists
  const [currentShopId, setCurrentShopId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      let shop: string | null = null;

      // ✅ prefer user_id first (new schema alignment)
      const byUserId = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (byUserId.data?.shop_id) {
        shop = byUserId.data.shop_id;
      } else {
        // legacy fallback: profiles.id == auth.uid()
        const byId = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("id", user.id)
          .maybeSingle();
        shop = byId.data?.shop_id ?? null;
      }

      setCurrentShopId(shop);
    })();
  }, [supabase]);

  // VIN / OCR draft hydration
  const draft = useWorkOrderDraft() as unknown as WorkOrderDraftHook;

  useEffect(() => {
    const hasVeh = Object.values(draft.vehicle || {}).some((v) => Boolean(v));
    const hasCust = Object.values(draft.customer || {}).some((v) => Boolean(v));

    if (hasVeh) {
      setVehicle((prev) => ({
        ...prev,
        vin: draft.vehicle?.vin ?? prev.vin,
        year: yearToStrOrNull(draft.vehicle?.year ?? prev.year),
        make: draft.vehicle?.make ?? prev.make,
        model: draft.vehicle?.model ?? prev.model,
        license_plate:
          draft.vehicle?.license_plate ??
          draft.vehicle?.plate ??
          prev.license_plate,

        // ✅ extra fields from VIN draft
        engine: draft.vehicle?.engine ?? prev.engine ?? null,
        submodel: draft.vehicle?.submodel ?? prev.submodel ?? null,
        engine_family: draft.vehicle?.engine_family ?? prev.engine_family ?? null,
        engine_type: draft.vehicle?.engine_type ?? prev.engine_type ?? null,
        fuel_type: draft.vehicle?.fuel_type ?? prev.fuel_type ?? null,
        drivetrain: draft.vehicle?.drivetrain ?? prev.drivetrain ?? null,
        transmission: draft.vehicle?.transmission ?? prev.transmission ?? null,
        transmission_type:
          draft.vehicle?.transmission_type ?? prev.transmission_type ?? null,
      }));
    }
    if (hasCust) {
      setCustomer((prev) => ({
        ...prev,
        first_name: draft.customer?.first_name ?? prev.first_name,
        last_name: draft.customer?.last_name ?? prev.last_name,
        phone: draft.customer?.phone ?? prev.phone,
        email: draft.customer?.email ?? prev.email,
      }));
    }

    if (hasVeh || hasCust) {
      setSourceFlags((s) => ({
        ...s,
        queryVehicle: s.queryVehicle || hasVeh,
        queryCustomer: s.queryCustomer || hasCust,
      }));
      draft.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-time hydration is intentional

  // keep waiter state in sync with an existing WO (editing case)
    const getCurrentProfileId = useCallback(
    async (userId: string): Promise<string | null> => {
    const byUserId = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle<Pick<ProfileRow, "id">>();

    if (byUserId.error) throw byUserId.error;
    if (byUserId.data?.id) return byUserId.data.id;

    const byId = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle<Pick<ProfileRow, "id">>();

    if (byId.error) throw byId.error;
    return byId.data?.id ?? null;
    },
    [supabase],
  );

useEffect(() => {
    if (!wo) return;
    const flag = (wo as WorkOrderWaiterRow).is_waiter ?? false;
    setIsWaiter(Boolean(flag));
    setExpectedCompletionInput(toDatetimeLocalInput(wo.expected_completion_at));
  }, [wo, setIsWaiter, setExpectedCompletionInput]);

  // get current user id + current profile id
  useEffect((): void => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);

      if (!user?.id) {
        setCurrentProfileId(null);
        return;
      }

      try {
        const profileId = await getCurrentProfileId(user.id);
        setCurrentProfileId(profileId);
      } catch {
        setCurrentProfileId(null);
      }
    })();
  }, [supabase, getCurrentProfileId]);

  const getOrLinkShopId = useCallback(async (userId: string): Promise<string | null> => {
    const byUserId = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (byUserId.error) throw byUserId.error;
    if (byUserId.data?.shop_id) return byUserId.data.shop_id;

    const byId = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", userId)
      .maybeSingle();

    if (byId.error) throw byId.error;
    if (byId.data?.shop_id) return byId.data.shop_id;

    const ownedShop = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (ownedShop.error) throw ownedShop.error;
    if (!ownedShop.data?.id) return null;

    const updByUserId = await supabase
      .from("profiles")
      .update({ shop_id: ownedShop.data.id })
      .eq("user_id", userId);

    if (updByUserId.error) {
      const updById = await supabase
        .from("profiles")
        .update({ shop_id: ownedShop.data.id })
        .eq("id", userId);

      if (updById.error) throw updById.error;
    }

    return ownedShop.data.id;
  }, [supabase]);

  // ✅ advisor ownership helper


  const buildCustomerInsert = (c: CustomerWithBusiness, shopId: string) => ({
    business_name: strOrNull(c.business_name ?? null),
    first_name: strOrNull(c.first_name),
    last_name: strOrNull(c.last_name),
    phone: normalizePhone(c.phone),
    email: normalizeEmail(c.email),
    address: strOrNull(c.address),
    city: strOrNull(c.city),
    province: strOrNull(c.province),
    postal_code: strOrNull(c.postal_code),
    shop_id: shopId,
  });

  // ✅ include extra vehicle fields in INSERT
  const buildVehicleInsert = (
    v: VehicleWithExtra,
    customerIdIn: string,
    shopId: string,
  ) => ({
    customer_id: customerIdIn,
    vin: validVinOrNull(v.vin),
    year: numOrNull(v.year),
    make: strOrNull(v.make),
    model: strOrNull(v.model),
    license_plate: strOrNull(v.license_plate),
    mileage: strOrNull(v.mileage),
    unit_number: strOrNull(v.unit_number),
    color: strOrNull(v.color),
    engine_hours: numOrNull(v.engine_hours),

    // ✅ NEW
    engine: strOrNull(v.engine ?? null),
    submodel: strOrNull(v.submodel ?? null),
    engine_family: strOrNull(v.engine_family ?? null),
    engine_type: strOrNull(v.engine_type ?? null),
    transmission: strOrNull(v.transmission ?? null),
    transmission_type: strOrNull(v.transmission_type ?? null),
    fuel_type: strOrNull(v.fuel_type ?? null),
    drivetrain: strOrNull(v.drivetrain ?? null),

    shop_id: shopId,
  });

  // ✅ patch update (only include fields that have values)
  const buildVehiclePatch = (
    v: VehicleWithExtra,
    customerIdIn: string,
  ): Partial<VehicleRow> => ({
    customer_id: customerIdIn,
    vin: validVinOrNull(v.vin),
    year: numOrNull(v.year),
    make: strOrNull(v.make),
    model: strOrNull(v.model),
    license_plate: strOrNull(v.license_plate),
    mileage: strOrNull(v.mileage),
    unit_number: strOrNull(v.unit_number),
    color: strOrNull(v.color),
    engine_hours: numOrNull(v.engine_hours),
    engine: strOrNull(v.engine ?? null),
    submodel: strOrNull(v.submodel ?? null),
    engine_family: strOrNull(v.engine_family ?? null),
    engine_type: strOrNull(v.engine_type ?? null),
    transmission: strOrNull(v.transmission ?? null),
    transmission_type: strOrNull(v.transmission_type ?? null),
    fuel_type: strOrNull(v.fuel_type ?? null),
    drivetrain: strOrNull(v.drivetrain ?? null),
  });

  const buildImplicitCustomerPatch = (
    patch: Omit<ReturnType<typeof buildCustomerInsert>, "shop_id">,
  ) =>
    Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== null && value !== undefined && value !== ""),
    ) as Partial<CustomerRow>;

  const buildImplicitVehiclePatch = (
    v: VehicleWithExtra,
    customerIdIn: string,
  ): Partial<VehicleRow> =>
    Object.fromEntries(
      Object.entries(buildVehiclePatch(v, customerIdIn)).filter(
        ([key, value]) =>
          key === "customer_id" || (value !== null && value !== undefined && value !== ""),
      ),
    ) as Partial<VehicleRow>;

  const hydrateCustomerFromRow = useCallback(
    (row: CustomerRowWithBusiness): CustomerWithBusiness =>
      normalizeCustomerForIntake({
        business_name: row.business_name ?? null,
        name: getStrField(row, "name"),
        display_name: getStrField(row, "display_name"),
        full_name: getStrField(row, "full_name"),
        first_name: getStrField(row, "first_name"),
        last_name: getStrField(row, "last_name"),
        contact_first_name: getStrField(row, "contact_first_name"),
        contact_last_name: getStrField(row, "contact_last_name"),
        phone: getStrField(row, "phone"),
        phone_number: getStrField(row, "phone_number"),
        email: getStrField(row, "email"),
        address: getStrField(row, "address"),
        street: getStrField(row, "street"),
        city: getStrField(row, "city"),
        province: getStrField(row, "province"),
        postal_code: getStrField(row, "postal_code"),
      }),
    [],
  );

  // Read canonical query params, with legacy aliases for existing handoff links.
  useEffect(() => {
    if (queryVehicleId) {
      setPrefillVehicleId(queryVehicleId);
      setSourceFlags((s) => ({ ...s, queryVehicle: true }));
    }
    if (queryCustomerId) {
      setPrefillCustomerId(queryCustomerId);
      setSourceFlags((s) => ({ ...s, queryCustomer: true }));
    }
  }, [queryCustomerId, queryVehicleId, setPrefillVehicleId, setPrefillCustomerId, setSourceFlags]);

  // Load appointment handoff context from bookingId and scope it to the user's shop.
  useEffect(() => {
    if (!bookingId) {
      setBookingPrefill(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setError("");
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) throw new Error("Not signed in.");

        const shopId = await getOrLinkShopId(user.id);
        if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

        const { data: booking, error: bookingErr } = await supabase
          .from("bookings")
          .select(
            "id, shop_id, customer_id, vehicle_id, work_order_id, status, notes, starts_at, ends_at",
          )
          .eq("id", bookingId)
          .maybeSingle<BookingConversionRow>();

        if (bookingErr) throw bookingErr;
        if (!booking) throw new Error("Appointment not found.");
        if (booking.shop_id !== shopId) {
          throw new Error("This appointment belongs to a different shop.");
        }
        if ((booking.status ?? "").toLowerCase() === "cancelled") {
          throw new Error("Cancelled appointments cannot be converted to work orders.");
        }

        if (cancelled) return;
        setBookingPrefill(booking);

        const bookingCustomerId = booking.customer_id ?? queryCustomerId;
        const bookingVehicleId = booking.vehicle_id ?? queryVehicleId;

        if (bookingCustomerId) {
          setPrefillCustomerId(bookingCustomerId);
          setSourceFlags((flags) => ({ ...flags, queryCustomer: true }));
        }
        if (bookingVehicleId) {
          setPrefillVehicleId(bookingVehicleId);
          setSourceFlags((flags) => ({ ...flags, queryVehicle: true }));
        }

        if (booking.work_order_id) {
          setInviteNotice("This appointment is already linked to a work order.");
          return;
        }

        setNotes((existing) => {
          if (existing?.includes("APPOINTMENT HANDOFF")) return existing;
          const block = buildBookingNotesBlock(booking);
          return existing?.trim() ? `${existing.trim()}\n\n${block}` : block;
        });
        setInviteNotice("Appointment loaded. Review the customer and vehicle, then create the work order.");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load appointment.";
        setBookingPrefill(null);
        setError(message);
        toast.error(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bookingId,
    queryCustomerId,
    queryVehicleId,
    supabase,
    setError,
    setInviteNotice,
    setNotes,
    setPrefillCustomerId,
    setPrefillVehicleId,
    setSourceFlags,
    getOrLinkShopId,
  ]);

  // Prefill from DB → session shapes, always scoped to the current user's shop.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!prefillCustomerId && !prefillVehicleId) return;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const shopId = await getOrLinkShopId(user.id);
        if (!shopId || cancelled) return;

        let effectiveCustomerId = prefillCustomerId;

        if (prefillCustomerId) {
          const { data } = await supabase
            .from("customers")
            .select("*")
            .eq("id", prefillCustomerId)
            .eq("shop_id", shopId)
            .maybeSingle();
          if (!cancelled && data) {
            setCustomer(hydrateCustomerFromRow(data as CustomerRowWithBusiness));
            setCustomerId(data.id);
            effectiveCustomerId = data.id;
          }
        }

        if (prefillVehicleId) {
          const query = supabase
            .from("vehicles")
            .select(
              "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, engine, submodel, engine_family, engine_type, transmission, transmission_type, fuel_type, drivetrain, customer_id",
            )
            .eq("id", prefillVehicleId)
            .eq("shop_id", shopId);

          const { data } = effectiveCustomerId
            ? await query.eq("customer_id", effectiveCustomerId).maybeSingle()
            : await query.maybeSingle();

          if (!cancelled && data) {
            setVehicle(hydrateVehicleFromRow(data as VehicleRow));
            setVehicleId(data.id);

            if (!effectiveCustomerId && data.customer_id) {
              const { data: cust } = await supabase
                .from("customers")
                .select("*")
                .eq("id", data.customer_id)
                .eq("shop_id", shopId)
                .maybeSingle();
              if (cust) {
                setCustomer(hydrateCustomerFromRow(cust as CustomerRowWithBusiness));
                setCustomerId(cust.id);
                effectiveCustomerId = cust.id;
              }
            }
          }
        }

        if (effectiveCustomerId && !prefillVehicleId) {
          const { data: vehicles } = await supabase
            .from("vehicles")
            .select(
              "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, engine, submodel, engine_family, engine_type, transmission, transmission_type, fuel_type, drivetrain, customer_id, created_at",
            )
            .eq("shop_id", shopId)
            .eq("customer_id", effectiveCustomerId)
            .order("created_at", { ascending: false })
            .limit(2);

          const rows = (vehicles ?? []) as VehicleRow[];
          if (!cancelled && rows.length === 1) {
            setVehicle(hydrateVehicleFromRow(rows[0]));
            setVehicleId(rows[0].id);
          }
        }
      } catch {
        /* Keep create flow usable if a stale handoff id cannot hydrate. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    prefillCustomerId,
    prefillVehicleId,
    supabase,
    setCustomer,
    setVehicle,
    setCustomerId,
    setVehicleId,
    hydrateCustomerFromRow,
    getOrLinkShopId,
  ]);


  async function ensureCustomer(shopId: string): Promise<CustomerRowWithBusiness> {
    const normalizedEmail = normalizeEmail(customer.email);
    const normalizedPhone = normalizePhone(customer.phone);
    const customerWrite = buildCustomerInsert(customer, shopId);
    const { shop_id: _shopId, ...customerPatch } = customerWrite;

    if (customerId) {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .eq("shop_id", shopId)
        .single();
      if (error) throw error;
      if (data) {
        const row = data as CustomerRowWithBusiness;
        const { data: patched, error: patchErr } = await supabase
          .from("customers")
          .update(customerPatch)
          .eq("id", row.id)
          .eq("shop_id", shopId)
          .select("*")
          .single();

        if (patchErr) throw patchErr;
        return (patched ?? row) as CustomerRowWithBusiness;
      }
    }

    if (normalizedEmail) {
      const { data: foundByEmail, error: emailErr } = await supabase
        .from("customers")
        .select("*")
        .eq("shop_id", shopId)
        .eq("email", normalizedEmail)
        .limit(1);

      if (emailErr) throw emailErr;
      if (foundByEmail?.length) {
        const row = foundByEmail[0] as CustomerRowWithBusiness;
        setCustomerId(row.id);

        const { data: patched, error: patchErr } = await supabase
          .from("customers")
          .update(buildImplicitCustomerPatch(customerPatch))
          .eq("id", row.id)
          .eq("shop_id", shopId)
          .select("*")
          .single();

        if (patchErr) throw patchErr;
        return (patched ?? row) as CustomerRowWithBusiness;
      }
    }

    if (normalizedPhone) {
      const { data: foundByPhone, error: phoneErr } = await supabase
        .from("customers")
        .select("*")
        .eq("shop_id", shopId)
        .eq("phone", normalizedPhone)
        .limit(1);

      if (phoneErr) throw phoneErr;
      if (foundByPhone?.length) {
        const row = foundByPhone[0] as CustomerRowWithBusiness;
        setCustomerId(row.id);

        const { data: patched, error: patchErr } = await supabase
          .from("customers")
          .update(buildImplicitCustomerPatch(customerPatch))
          .eq("id", row.id)
          .eq("shop_id", shopId)
          .select("*")
          .single();

        if (patchErr) throw patchErr;
        return (patched ?? row) as CustomerRowWithBusiness;
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("customers")
      .insert(customerWrite)
      .select("*")
      .single();

    if (insErr || !inserted)
      throw new Error(insErr?.message ?? "Failed to create customer");

    setCustomerId(inserted.id);
    return inserted as CustomerRowWithBusiness;
  }

  // ✅ when a vehicle exists, UPDATE it with the form values so edits persist
  async function ensureVehicleRow(
    cust: CustomerRow,
    shopId: string,
  ): Promise<VehicleRow> {
    const duplicateCheck = await checkVehicleDuplicates({
      vin: vehicle.vin,
      licensePlate: vehicle.license_plate,
      unitNumber: vehicle.unit_number,
      customerId: cust.id,
      vehicleId,
    });

    const differentCustomerVin = duplicateCheck.matches.find(
      (match) => match.match_type === "vin" && match.same_customer === false,
    );
    if (differentCustomerVin) {
      throw new Error(
        "This VIN is already assigned to another customer. Contact shop/admin to move vehicle.",
      );
    }

    const sameCustomerMatch = duplicateCheck.matches.find(
      (match) => match.same_customer === true,
    );
    if (!vehicleId && sameCustomerMatch) {
      const label = [sameCustomerMatch.year, sameCustomerMatch.make, sameCustomerMatch.model]
        .filter(Boolean)
        .join(" ") || sameCustomerMatch.vin || sameCustomerMatch.license_plate || "vehicle";
      const useExisting = window.confirm(
        `Vehicle already exists: ${label}. Use existing vehicle?`,
      );
      if (!useExisting) {
        throw new Error("Cancel/change VIN before creating another vehicle.");
      }
      const { data: existing, error: existingErr } = await supabase
        .from("vehicles")
        .update(buildImplicitVehiclePatch(vehicle, cust.id))
        .eq("id", sameCustomerMatch.id)
        .eq("shop_id", shopId)
        .eq("customer_id", cust.id)
        .select("*")
        .single();
      if (existingErr || !existing) {
        throw new Error(existingErr?.message ?? "Failed to update existing vehicle.");
      }
      setVehicleId(existing.id);
      return existing as VehicleRow;
    }

    // If an explicit vehicleId is set, patch update that vehicle (instead of just returning it)
    if (vehicleId) {
      const { data: currentVehicle, error: currentErr } = await supabase
        .from("vehicles")
        .select("id, customer_id")
        .eq("id", vehicleId)
        .eq("shop_id", shopId)
        .single();

      if (currentErr) throw currentErr;
      if (currentVehicle?.customer_id && currentVehicle.customer_id !== cust.id) {
        throw new Error(
          "Use existing vehicle is selected, but it belongs to another customer. Contact shop/admin to move vehicle.",
        );
      }

      const patch = buildVehiclePatch(vehicle, cust.id);

      const { data: updated, error: updErr } = await supabase
        .from("vehicles")
        .update(patch)
        .eq("id", vehicleId)
        .eq("shop_id", shopId)
        .select("*")
        .single();

      if (updErr) throw updErr;
      if (updated) return updated as VehicleRow;

      // fallback read (shouldn’t usually happen)
      const { data: fallback } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .single();
      if (fallback) return fallback as VehicleRow;
    }

    const orParts = [
      validVinOrNull(vehicle.vin) ? `vin.eq.${validVinOrNull(vehicle.vin)}` : "",
      vehicle.license_plate ? `license_plate.eq.${vehicle.license_plate}` : "",
    ].filter(Boolean);

    if (orParts.length) {
      const { data: maybe, error: findErr } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", cust.id)
        .eq("shop_id", shopId)
        .or(orParts.join(","));

      if (findErr) throw findErr;

      if (maybe?.length) {
        // Identifier-based reuse must preserve fields the advisor did not enter.
        const id = (maybe[0] as VehicleRow).id;
        const patch = buildImplicitVehiclePatch(vehicle, cust.id);

        const { data: updated, error: updErr } = await supabase
          .from("vehicles")
          .update(patch)
          .eq("id", id)
          .eq("shop_id", shopId)
          .select("*")
          .single();

        if (updErr) throw updErr;

        setVehicleId(id);
        return (updated ?? maybe[0]) as VehicleRow;
      }
    }

    // Otherwise insert new
    const { data: inserted, error: insErr } = await supabase
      .from("vehicles")
      .insert(buildVehicleInsert(vehicle, cust.id, shopId))
      .select("*")
      .single();

    if (insErr || !inserted)
      throw new Error(insErr?.message ?? "Failed to create vehicle");

    setVehicleId(inserted.id);
    return inserted as VehicleRow;
  }

  const [savingCv, setSavingCv] = useState(false);

  const fetchLines = useCallback(async () => {
    if (!wo?.id) return;
    const { data } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });

    setLines(data ?? []);
  }, [supabase, wo?.id, setLines]);

  // ✅ normal function (no hook deps warnings, no parser issues)
  async function handleSaveCustomerVehicle(): Promise<string> {
    if (savingCv) return wo?.id ?? "";
    setSavingCv(true);
    setError("");

    try {
      if (
        !customer.business_name &&
        !customer.first_name &&
        !customer.last_name &&
        !customer.phone &&
        !customer.email
      ) {
        throw new Error(
          "Please enter at least a customer name, business name, phone, or email.",
        );
      }
      validateVehicleSaveInput(vehicle);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const hadExplicitCustomerId = Boolean(customerId);
      const hadExplicitVehicleId = Boolean(vehicleId);
      const cust = await ensureCustomer(shopId);
      const veh = await ensureVehicleRow(cust, shopId);
      const persistedCustomer = hydrateCustomerFromRow(cust);
      const persistedVehicle = hydrateVehicleFromRow(veh);

      assertWritePersisted(
        "customer",
        hadExplicitCustomerId
          ? buildCustomerInsert(customer, shopId)
          : buildImplicitCustomerPatch(
              (({ shop_id: _shopId, ...patch }) => patch)(
                buildCustomerInsert(customer, shopId),
              ),
            ),
        cust as unknown as Record<string, unknown>,
      );
      assertWritePersisted(
        "vehicle",
        (hadExplicitVehicleId
          ? buildVehiclePatch(vehicle, cust.id)
          : buildImplicitVehiclePatch(vehicle, cust.id)) as Record<string, unknown>,
        veh as unknown as Record<string, unknown>,
      );

      setCustomer(persistedCustomer);
      setVehicle(persistedVehicle);

      // ✅ persist full vehicle info into draft/session
      cvDraft.bulkSet({
        customer: {
          first_name: persistedCustomer.first_name ?? null,
          last_name: persistedCustomer.last_name ?? null,
          phone: persistedCustomer.phone ?? null,
          email: persistedCustomer.email ?? null,
          address: persistedCustomer.address ?? null,
          city: persistedCustomer.city ?? null,
          province: persistedCustomer.province ?? null,
          postal_code: persistedCustomer.postal_code ?? null,
          ...(persistedCustomer.business_name
            ? { business_name: persistedCustomer.business_name }
            : {}),
        },
        vehicle: persistedVehicle,
      });

      if (wo?.id) {
        if (wo.customer_id !== cust.id || wo.vehicle_id !== veh.id) {
          const waiter = (wo as WorkOrderWaiterRow).is_waiter;

          const { data: updated, error: updErr } = await supabase
            .from("work_orders")
            .update({
              customer_id: cust.id,
              vehicle_id: veh.id,
              expected_completion_at: fromDatetimeLocalInput(expectedCompletionInput),
              ...(waiter !== undefined ? { is_waiter: waiter } : {}),
            })
            .eq("id", wo.id)
            .select("*")
            .single();

          if (updErr) throw updErr;
          setWo(updated);
        }

        await fetchLines();
        return wo.id;
      }

      // ✅ advisor ownership
      const advisorProfileId =
        currentProfileId ?? (await getCurrentProfileId(user.id));

      const rpcArgs: DB["public"]["Functions"]["create_work_order_with_custom_id"]["Args"] = {
        p_shop_id: shopId,
        p_customer_id: cust.id,
        p_vehicle_id: veh.id,
        p_notes: strOrNull(notes) ?? "",
        p_priority: priority,
        p_is_waiter: isWaiter,
        ...(advisorProfileId ? { p_advisor_id: advisorProfileId } : {}),
      };

      const { data: created, error: rpcErr } = await supabase.rpc(
        "create_work_order_with_custom_id",
        rpcArgs,
      );

      if (rpcErr) {
        throw new Error(rpcErr.message || "Failed to create work order.");
      }

      const createdRow = (created as unknown as CreateWoRpcRow | null) ?? null;
      if (!createdRow?.id) {
        throw new Error("Failed to create work order (no row returned).");
      }

      setWo(createdRow as unknown as WorkOrderRow);
      const expectedCompletionAt = fromDatetimeLocalInput(expectedCompletionInput);
      if (expectedCompletionAt) {
        const { data: woWithExpected } = await supabase
          .from("work_orders")
          .update({ expected_completion_at: expectedCompletionAt })
          .eq("id", createdRow.id)
          .select("*")
          .single();
        if (woWithExpected) {
          setWo(woWithExpected as WorkOrderRow);
        }
      }
      await fetchLines();

      return String(createdRow.id);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to save customer/vehicle.";
      setError(msg);
      throw e;
    } finally {
      setSavingCv(false);
    }
  }

  async function maybeOpenIntakeAfterSave(woId: string) {
    if (!woId) return;
    if (intakeDismissed) return;

    // If already saved on this WO, don't prompt
    const { data: w } = await supabase
      .from("work_orders")
      .select("id, notes")
      .eq("id", woId)
      .maybeSingle();

    const existingNotes = (w?.notes ?? null) as string | null;
    if (
      typeof existingNotes === "string" &&
      existingNotes.includes("PORTAL INTAKE")
    )
      return;

    setIntakeOpen(true);
  }

  async function saveIntakeAndCreateDiagnosticLine() {
    if (!wo?.id) return;
    const concern = intakeConcern.trim();
    if (!concern) {
      toast.error("Please enter the intake concern.");
      return;
    }

    if (intakeSaving) return;
    setIntakeSaving(true);

    try {
      const intakeBlock = buildIntakeNotesBlock({
        concern,
        details: intakeDetails,
        contactPref: intakeContactPref,
        mileage: intakeMileage,
      });

      const merged = mergeNotes(wo.notes ?? null, intakeBlock);

      const { data: updatedWo, error: woErr } = await supabase
        .from("work_orders")
        .update({ notes: merged })
        .eq("id", wo.id)
        .select("*")
        .single();

      if (woErr) throw woErr;
      setWo(updatedWo as WorkOrderRow);

      const intakePayload = {
        version: "1.0" as const,
        subject: {
          customer_id: customerId ?? "",
          vehicle_id: vehicleIdProp ?? "",
          contact_id: null,
          unit_number: vehicle.unit_number ?? null,
          odometer_km: intakeMileage.trim() ? Number(intakeMileage.replace(/,/g, "")) || null : null,
          engine_hours: vehicle.engine_hours ? Number(vehicle.engine_hours) || null : null,
        },
        concern: {
          primary_text: concern,
          additional_text: intakeDetails.trim() || null,
          started_at: null,
          happened_before: null,
          recent_work: null,
        },
        duplication: {
          duplicable: "unsure" as const,
          conditions: null,
          last_occurred_at: null,
        },
        symptoms: {
          primary_system: "other" as const,
          types: ["other" as const],
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
          priority: "can_wait" as const,
          preferred_contact:
            intakeContactPref === "Email"
              ? "email"
              : intakeContactPref === "Text only"
                ? "text"
                : intakeContactPref === "Call only"
                  ? "phone"
                  : "phone",
        },
        attachments: null,
        internal_notes: {
          advisor_note: notes?.trim() || null,
          assigned_tech_id: null,
          inspection_template_id: null,
        },
      };

      const res = await fetch(`/api/work-orders/${wo.id}/intake?mode=app`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "app",
          intake: intakePayload,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; createdLines?: number; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to save intake");
      }

      await fetchLines();
      toast.success(
        json.createdLines && json.createdLines > 0
          ? `Intake saved and ${json.createdLines} suggested line${json.createdLines === 1 ? "" : "s"} created.`
          : "Intake saved.",
      );
      setIntakeOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save intake.";
      toast.error(msg);
    } finally {
      setIntakeSaving(false);
    }
  }

  function dismissIntakeOnce() {
    setIntakeOpen(false);
  }

  function dismissIntakeForever() {
    try {
      window.localStorage.setItem(INTAKE_DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
    setIntakeDismissed(true);
    setIntakeOpen(false);
  }

  const handleClearForm = useCallback(() => {
    setCustomer(defaultCustomer);
    setVehicle(defaultVehicle);
    setCustomerId(null);
    setVehicleId(null);
    setPrefillCustomerId(null);
    setPrefillVehicleId(null);
    setPhotoFiles([]);
    setDocFiles([]);
    setUploadSummary(null);
    setInviteNotice("");
    setSendInvite(true);
    setSelectedMaintenanceCodes([]);
    setIsWaiter(false);
    cvDraft.reset();
  }, [
    defaultCustomer,
    defaultVehicle,
    setCustomer,
    setVehicle,
    setCustomerId,
    setVehicleId,
    setPrefillCustomerId,
    setPrefillVehicleId,
    setInviteNotice,
    setSendInvite,
    setIsWaiter,
    cvDraft,
  ]);

  async function uploadVehicleFiles(vId: string): Promise<UploadSummary> {
    let uploaded = 0;
    let failed = 0;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const uploader = user?.id ?? null;
    const currentShopIdForMedia = wo?.shop_id ?? null;

    const upOne = async (
      bucket: "vehicle-photos" | "vehicle-docs",
      f: File,
      mediaType: "photo" | "document",
    ) => {
      // ✅ IMPORTANT: match Customer Profile page storage_path convention: `${vehicleId}/...`
      const safeName = f.name.replaceAll("/", "_");
      const key = `${vId}/${Date.now()}_${safeName}`;

      const up = await supabase.storage.from(bucket).upload(key, f, {
        upsert: false,
        contentType: f.type || undefined,
      });

      if (up.error) {
        failed += 1;
        return;
      }

      const { error: rowErr } = await supabase.from("vehicle_media").insert({
        vehicle_id: vId,
        type: mediaType,
        storage_path: key,
        filename: f.name,
        uploaded_by: uploader,
        shop_id: currentShopIdForMedia,
      });

      if (rowErr) failed += 1;
      else uploaded += 1;
    };

    for (const f of photoFiles) await upOne("vehicle-photos", f, "photo");
    for (const f of docFiles) await upOne("vehicle-docs", f, "document");

    return { uploaded, failed };
  }

  const handleDeleteLine = useCallback(
    async (lineId: string) => {
      if (!wo?.id) return;

      const ok = confirm("Delete this line?");
      if (!ok) return;

      try {
        const base = supabase
          .from("work_order_lines")
          .delete()
          .eq("id", lineId)
          .eq("work_order_id", wo.id);

        const res = wo.shop_id
          ? await base.eq("shop_id", wo.shop_id).select("id").maybeSingle()
          : await base.select("id").maybeSingle();

        const { data: deleted, error: delErr } = res;

        if (delErr) {
          alert(delErr.message || "Delete failed");
          return;
        }
        if (!deleted) {
          alert(
            "Could not delete the line (no matching row). Check permissions/policies.",
          );
          return;
        }

        setLines((prev) => prev.filter((l) => l.id !== lineId));
        await fetchLines();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        alert(msg);
      }
    },
    [supabase, wo?.id, wo?.shop_id, fetchLines, setLines],
  );

  const openInspectionForLine = useCallback(
    async (ln: WorkOrderLine) => {
      if (!ln?.id) return;

      const anyLine = ln as WorkOrderLineWithInspectionMeta;
      const templateId = extractInspectionTemplateId(anyLine);

      if (!templateId) {
        toast.error(
          "This job line doesn't have an inspection template attached yet. Build or attach a custom inspection first.",
        );
        return;
      }

      const templateName =
        anyLine.inspection_template ??
        anyLine.inspectionTemplate ??
        anyLine.template ??
        getMetaString(anyLine.metadata, "inspection_template") ??
        getMetaString(anyLine.metadata, "template") ??
        null;

      const sp = new URLSearchParams();

      if (wo?.id) {
        sp.set("workOrderId", wo.id);
        sp.set("work_order_id", wo.id);
      }

      sp.set("workOrderLineId", ln.id);
      sp.set("work_order_line_id", ln.id);
      sp.set("lineId", ln.id);

      sp.set("templateId", templateId);
      sp.set("template_id", templateId);

      if (templateName) {
        sp.set("templateName", templateName);
        sp.set("template_name", templateName);
      }

      sp.set("embed", "1");
      sp.set("view", "mobile");

      if (ln.description) {
        sp.set("seed", String(ln.description));
      }

      const url = `/inspections/run?${sp.toString()}`;

      setInspectionSrc(url);
      setInspectionOpen(true);
      toast.success("Inspection opened");
    },
    [wo?.id],
  );

  async function linkBookingToWorkOrder(bookingIdToLink: string, workOrder: Pick<WorkOrderRow, "id" | "shop_id">) {
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, shop_id, work_order_id, status")
      .eq("id", bookingIdToLink)
      .maybeSingle<Pick<BookingConversionRow, "id" | "shop_id" | "work_order_id" | "status">>();

    if (bookingErr) throw bookingErr;
    if (!booking) throw new Error("Appointment not found for work order link.");
    if (booking.shop_id !== workOrder.shop_id) {
      throw new Error("Cannot link a work order to an appointment from another shop.");
    }
    if ((booking.status ?? "").toLowerCase() === "cancelled") {
      throw new Error("Cancelled appointments cannot be linked to work orders.");
    }
    if (booking.work_order_id && booking.work_order_id !== workOrder.id) {
      throw new Error("This appointment is already linked to another work order.");
    }
    if (booking.work_order_id === workOrder.id) return;

    const { error: updateErr } = await supabase
      .from("bookings")
      .update({ work_order_id: workOrder.id })
      .eq("id", booking.id)
      .eq("shop_id", workOrder.shop_id);

    if (updateErr) throw updateErr;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setInviteNotice("");
    setUploadSummary(null);

    try {
      const woId = await handleSaveCustomerVehicle();
      if (!woId) throw new Error("Could not create work order.");

      const { data: latest, error: latestErr } = await supabase
        .from("work_orders")
        .select("id, shop_id, custom_id, customer_id, vehicle_id, is_waiter")
        .eq("id", woId)
        .maybeSingle();

      if (latestErr) throw latestErr;
      if (!latest?.customer_id || !latest?.vehicle_id) {
        throw new Error("Please link a customer and vehicle first.");
      }

      if (bookingId) {
        await linkBookingToWorkOrder(bookingId, latest);
      }

      if (selectedMaintenanceCodes.length > 0) {
        const maintRes = await fetch("/api/work-orders/maintenance-suggestions/add-bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: latest.id,
            serviceCodes: selectedMaintenanceCodes,
          }),
        });

        const maintJson = (await maintRes.json().catch(() => null)) as
          | {
              ok?: boolean;
              added?: Array<{ serviceCode: string }>;
              skipped?: Array<{ serviceCode: string; error: string }>;
              error?: string;
            }
          | null;

        if (!maintRes.ok || !maintJson?.ok) {
          throw new Error(maintJson?.error || "Failed to attach maintenance suggestions.");
        }

        if (Array.isArray(maintJson.skipped) && maintJson.skipped.length > 0) {
          const detail = maintJson.skipped
            .map((item) => `${item.serviceCode}: ${item.error}`)
            .join("; ");
          setInviteNotice(
            `Work order created. Some maintenance items were skipped: ${detail}`,
          );
        }
      }

      if (vehicleId && (photoFiles.length || docFiles.length)) {
        const summary = await uploadVehicleFiles(vehicleId);
        setUploadSummary(summary);
      }

      if (sendInvite && customer.email) {
        try {
          const res = await fetch("/api/portal/send-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: customer.email,
              customerId: latest.customer_id,
              workOrderId: latest.id,
            }),
          });

          const j = (await res.json().catch(() => null)) as
            | { ok?: boolean; error?: string }
            | null;

          if (!res.ok || !j?.ok) {
            setInviteNotice(
              `Work order created. Failed to send invite email${
                j?.error ? `: ${j.error}` : ""
              }.`,
            );
          } else {
            setInviteNotice("Work order created. Invite email sent to the customer.");
          }
        } catch {
          setInviteNotice("Work order created. Failed to send invite email (caught).");
        }
      }

      handleClearForm();

      // Also clear in-session workorder+lines draft
      setWo(null);
      setLines([]);
      setNotes("");
      setPriority(3);
      setType("maintenance");

      router.push(`/work-orders/${latest.id}/approve`);
    } catch (ex) {
      const message =
        ex instanceof Error ? ex.message : "Failed to create work order.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!wo?.id) return;
    void fetchLines();
    const ch = supabase
      .channel(`create-wo:${wo.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchLines(),
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
  }, [supabase, wo?.id, fetchLines]);

  useEffect(() => {
    const h = () => {
      void fetchLines();
    };
    window.addEventListener("wo:line-added", h);
    return () => window.removeEventListener("wo:line-added", h);
  }, [fetchLines]);

  const vehicleLabel =
    vehicle.year || vehicle.make || vehicle.model
      ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
      : vehicle.license_plate
        ? `Plate ${vehicle.license_plate}`
        : null;

  // ✅ never undefined
  const vehicleIdProp: string | null = vehicleId ?? wo?.vehicle_id ?? null;

  return (
    <div
      className="
        min-h-screen bg-[var(--theme-surface-2,var(--theme-surface-page))] px-4 py-6 text-foreground
      "
      style={{ ["--copper" as never]: COPPER }}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className={cx(card, "px-5 py-4")}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.25em] text-[color:var(--theme-text-secondary)]">
                Work Orders
              </div>
                <h1 className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
                  Create Work Order
                </h1>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  Intake and plan the visit, then continue to approvals once the order is ready.
                </p>

              {wo?.custom_id && (
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  Current WO:{" "}
                  <span className="font-mono text-[color:var(--copper)]">
                    {wo.custom_id}
                  </span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (returnTo?.startsWith("/")) {
                  router.push(returnTo);
                } else {
                  router.back();
                }
              }}
              className={cx("shrink-0 px-4 py-2 text-sm font-semibold", softButton)}
            >
              {returnTo ? "Back to appointments" : "Back to list"}
            </button>
          </div>
        </div>

        {/* Body */}
        <section className={cx(card, "px-4 py-5 sm:px-6 sm:py-6")}>
          {error && (
            <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {uploadSummary && (
            <div className={cx("mb-4 px-4 py-3 text-sm text-[color:var(--theme-text-primary)]", subtlePanel)}>
              Uploaded {uploadSummary.uploaded} file(s)
              {uploadSummary.failed ? `, ${uploadSummary.failed} failed` : ""}.
            </div>
          )}

          {inviteNotice && (
            <div className={cx("mb-4 px-4 py-3 text-sm text-[color:var(--theme-text-primary)]", subtlePanel)}>
              <div>{inviteNotice}</div>
              {bookingPrefill ? (
                <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  Appointment: {formatBookingWindow(bookingPrefill.starts_at, bookingPrefill.ends_at)}
                  {bookingPrefill.vehicle_id ? " · vehicle preselected" : " · vehicle can be selected or created below"}
                </div>
              ) : null}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Visit setup */}
            <section className={sectionPanel}>
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                  Visit Setup
                </h2>
                <span className="text-[11px] text-[color:var(--theme-text-muted)]">Planning controls</span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <div className={cx("p-4", childPanel)}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                        Customer waiting
                      </div>
                      <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                        Marks this work order as a waiter across queues and boards.
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={isWaiter}
                      onClick={() => setIsWaiter((v) => !v)}
                      disabled={loading}
                      className={[
                        "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition",
                        isWaiter
                          ? "border-[color:var(--copper)]/70 bg-[color:var(--copper)]/20"
                          : "border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]",
                        loading ? "opacity-60" : "hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_82%,_var(--theme-surface-page))]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-5 w-5 rounded-full transition",
                          isWaiter
                            ? "translate-x-8 bg-[color:var(--copper)] shadow-[0_0_16px_rgba(197,122,74,0.55)]"
                            : "translate-x-1 bg-[color:var(--theme-surface-subtle)]",
                        ].join(" ")}
                      />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        isWaiter
                          ? "border-amber-400/50 bg-amber-500/10 text-amber-100"
                          : "border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-secondary)]",
                      ].join(" ")}
                    >
                      {isWaiter ? "Waiter" : "Drop-off"}
                    </span>
                  </div>
                </div>

                <div className={cx("p-3.5", childPanel)}>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="input"
                    disabled={loading}
                  >
                    <option value={1}>Urgent</option>
                    <option value={2}>High</option>
                    <option value={3}>Normal</option>
                    <option value={4}>Low</option>
                  </select>
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                    Used to highlight urgent jobs in queues and dashboards.
                  </p>
                </div>

                <div className={cx("p-3.5", childPanel)}>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                    Default job type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as WOType)}
                    className="input"
                    disabled={loading}
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="inspection">Inspection</option>
                  </select>
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                    Sets the default for new lines you add on this work order.
                  </p>
                </div>

                <div className={cx("p-3.5", childPanel)}>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                    Target completion
                  </label>
                  <input
                    type="datetime-local"
                    value={expectedCompletionInput}
                    onChange={(e) => setExpectedCompletionInput(e.target.value)}
                    className="input"
                    disabled={loading}
                  />
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                    Internal advisor planning target in create flow (read-only on technician work-order surfaces).
                  </p>
                </div>
              </div>
            </section>

            {/* Customer & Vehicle */}
            <section className={sectionPanel}>
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-sm font-semibold tracking-[0.08em] text-[color:var(--theme-text-primary)]">
                  Customer &amp; Vehicle
                </h2>
                <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                  Primary intake section
                </span>
              </div>

              <CustomerVehicleForm
                customer={customer}
                vehicle={vehicle}
                saving={savingCv}
                workOrderExists={!!wo?.id}
                shopId={wo?.shop_id ?? currentShopId}
                selectedCustomerId={customerId}
                selectedVehicleId={vehicleIdProp}
                handlers={{
                  onCustomerChange,
                  onVehicleChange: onVehicleChange as unknown as (
                    field: keyof SessionVehicle,
                    value: string | null,
                  ) => void,
                  onCustomerSelected: (id: string) => setCustomerId(id),
                  onVehicleSelected: (id: string) => setVehicleId(id),
                }}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const id = await handleSaveCustomerVehicle();
                    if (id) await maybeOpenIntakeAfterSave(id);
                  }}
                  disabled={savingCv || loading}
                  className="
                    rounded-full border border-[color:var(--copper)]/70
                    bg-[color:var(--copper)]/12 px-4 py-2 text-sm font-semibold
                    text-[color:var(--copper)] hover:bg-[color:var(--copper)]/18 disabled:opacity-60
                  "
                >
                  {savingCv ? "Saving…" : "Save & Continue"}
                </button>

                <button
                  type="button"
                  onClick={handleClearForm}
                  className={cx("px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]", softButton)}
                >
                  Clear form
                </button>

                <VinCaptureModal
                  userId={currentUserId ?? "anon"}
                  action="/api/vin"
                  onDecoded={(d: VinDecoded) => {
                    const y = yearToStrOrNull(d.year);
                    const decodedVehicle: Partial<VehicleWithExtra> = {
                      vin: d.vin,
                    };

                    if (y) decodedVehicle.year = y;
                    if (strOrNull(d.make)) decodedVehicle.make = strOrNull(d.make);
                    if (strOrNull(d.model)) decodedVehicle.model = strOrNull(d.model);
                    if (strOrNull(d.engine)) decodedVehicle.engine = strOrNull(d.engine);
                    if (strOrNull(d.submodel ?? d.trim)) {
                      decodedVehicle.submodel = strOrNull(d.submodel ?? d.trim);
                    }
                    if (strOrNull(d.engineFamily)) {
                      decodedVehicle.engine_family = strOrNull(d.engineFamily);
                    }
                    if (strOrNull(d.engineType)) {
                      decodedVehicle.engine_type = strOrNull(d.engineType);
                    }
                    if (strOrNull(d.fuelType)) decodedVehicle.fuel_type = strOrNull(d.fuelType);
                    if (strOrNull(d.driveType)) decodedVehicle.drivetrain = strOrNull(d.driveType);
                    if (strOrNull(d.transmission)) {
                      decodedVehicle.transmission = strOrNull(d.transmission);
                    }
                    if (strOrNull(d.transmissionType)) {
                      decodedVehicle.transmission_type = strOrNull(d.transmissionType);
                    }

                    draft.setVehicle(decodedVehicle);

                    setVehicle((prev) => ({
                      ...prev,
                      vin: decodedVehicle.vin ?? prev.vin,
                      year: decodedVehicle.year ?? prev.year,
                      make: decodedVehicle.make ?? prev.make,
                      model: decodedVehicle.model ?? prev.model,
                      engine: decodedVehicle.engine ?? prev.engine ?? null,
                      submodel: decodedVehicle.submodel ?? prev.submodel ?? null,
                      engine_family:
                        decodedVehicle.engine_family ?? prev.engine_family ?? null,
                      engine_type:
                        decodedVehicle.engine_type ?? prev.engine_type ?? null,
                      fuel_type: decodedVehicle.fuel_type ?? prev.fuel_type ?? null,
                      drivetrain: decodedVehicle.drivetrain ?? prev.drivetrain ?? null,
                      transmission:
                        decodedVehicle.transmission ?? prev.transmission ?? null,
                      transmission_type:
                        decodedVehicle.transmission_type ??
                        prev.transmission_type ??
                        null,
                    }));

                    cvDraft.bulkSet({
                      vehicle: decodedVehicle,
                    });
                  }}
                >
                  <span
                    className={cx(
                      "cursor-pointer px-4 py-2 text-sm font-semibold hover:border-[color:var(--copper)]/55 hover:text-[color:var(--copper)]",
                      softButton,
                    )}
                  >
                    Add by VIN / Scan
                  </span>
                </VinCaptureModal>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                <input
                  id="send-invite"
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]"
                  disabled={loading}
                />
                Email a customer portal sign-up link
              </label>
            </section>

            {/* Create-flow maintenance suggestions */}
            <CreateFlowMaintenanceSelector
              workOrderId={wo?.id ?? null}
              vehicleId={vehicleIdProp}
              enabled={!!customerId && !!vehicleIdProp}
              selectedServiceCodes={selectedMaintenanceCodes}
              onChange={setSelectedMaintenanceCodes}
              onAdded={fetchLines}
            />

            {/* Uploads */}
            <section className={sectionPanel}>
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                  Uploads
                </h2>
                <span className="text-[11px] text-[color:var(--theme-text-muted)]">Editable before save</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                    Vehicle Photos
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                    className="input"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                    Documents (PDF/JPG/PNG)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    onChange={(e) => setDocFiles(Array.from(e.target.files ?? []))}
                    className="input"
                    disabled={loading}
                  />
                </div>
              </div>
            </section>

            {/* Internal notes */}
            <section className={sectionPanel}>
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                  Internal Notes
                </h2>
                <span className="text-[11px] text-[color:var(--theme-text-muted)]">Saved with the work order</span>
              </div>

              <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={3}
                placeholder="Optional notes for technician"
                disabled={loading}
              />
            </section>

            {/* Menu quick add */}
            {wo?.id && (
              <section className={sectionPanel}>
                <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                    Reusable adds: menu items & inspection templates
                  </h2>
                  <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                    Catalog lane: menu_items • Template lane: inspection_templates
                  </span>
                </div>
                <MenuQuickAdd workOrderId={wo.id} />
              </section>
            )}

            {/* Add line */}
            {wo?.id && (
              <section className={sectionPanel}>
                <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                    Manual entry line
                  </h2>
                  <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                    Direct custom line with optional smart repair suggestion
                  </span>
                </div>
                <NewWorkOrderLineForm
                  workOrderId={wo.id}
                  vehicleId={vehicleIdProp}
                  defaultJobType={type}
                  shopId={wo.shop_id ?? null}
                  onCreated={fetchLines}
                />
              </section>
            )}

            {/* Current lines */}
            <section className={sectionPanel}>
              <div className={cx("mb-3 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                  Current lines
                </h2>

                {wo?.id && (
                  <button
                    type="button"
                    onClick={() => setAiSuggestOpen(true)}
                    className="
                      inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold
                      border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10 text-[color:var(--copper)]
                      hover:bg-[color:var(--copper)]/15
                    "
                  >
                    AI: Suggest jobs
                  </button>
                )}
              </div>

              {!wo?.id || lines.length === 0 ? (
                <div className={cx("px-4 py-5 text-sm text-[color:var(--theme-text-secondary)]", subtlePanel)}>
                  No lines yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      Jobs (Punchable)
                    </div>
                    <div className="space-y-2">
                      {lines
                        .filter((ln) => (ln.line_type ?? "job") !== "info")
                        .map((ln) => (
                    <div
                      key={ln.id}
                      className={cx(
                        "flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between",
                        subtlePanel,
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[color:var(--theme-text-primary)]">
                          {ln.description || ln.complaint || "Untitled job"}
                        </div>
                        <div className="text-xs text-[color:var(--theme-text-muted)]">
                          {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                          {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} •{" "}
                          {(ln.status ?? "awaiting").replaceAll("_", " ")}
                        </div>
                        {(ln.complaint || ln.cause || ln.correction) && (
                          <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                            {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                            {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                            {ln.correction ? `| Corr: ${ln.correction}` : ""}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {ln.job_type === "inspection" && (
                          <button
                            type="button"
                            onClick={() => void openInspectionForLine(ln)}
                            className="
                              rounded-full border px-3 py-2 text-sm font-semibold
                              border-[color:var(--copper)]/70 bg-[color:var(--copper)]/10 text-[color:var(--copper)]
                              hover:bg-[color:var(--copper)]/15
                            "
                          >
                            Open inspection
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleDeleteLine(ln.id)}
                          className={cx(
                            "rounded-full border border-red-400/25 bg-[color:color-mix(in_srgb,var(--theme-card-bg,var(--theme-surface-page))_62%,transparent)] px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10",
                          )}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      Info / Context
                    </div>
                    <div className="space-y-2">
                      {lines
                        .filter((ln) => (ln.line_type ?? "job") === "info")
                        .map((ln) => (
                          <div
                            key={ln.id}
                            className={cx("p-3 text-sm text-[color:var(--theme-text-secondary)]", subtlePanel)}
                          >
                            <div className="font-medium text-[color:var(--theme-text-primary)]">
                              {ln.description || ln.complaint || "Context line"}
                            </div>
                            {(ln.complaint || ln.notes) && (
                              <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                                {ln.complaint ?? ln.notes}
                              </div>
                            )}
                          </div>
                        ))}
                      {lines.every((ln) => (ln.line_type ?? "job") !== "info") && (
                        <p className="text-xs text-[color:var(--theme-text-muted)]">No info/context lines.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Footer actions */}
            <div className="sticky bottom-3 z-10 rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-3 backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="
                  rounded-full border border-[color:var(--copper)]/70
                  bg-[color:var(--copper)]/12 px-6 py-2 text-sm font-semibold
                  text-[color:var(--copper)] hover:bg-[color:var(--copper)]/15
                  disabled:opacity-60
                "
              >
                {loading ? "Creating..." : "Create & Continue to Approval"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/work-orders")}
                className="text-sm text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                disabled={loading}
              >
                Cancel
              </button>
              </div>
            </div>
          </form>

          {inspectionOpen && inspectionSrc && (
            <InspectionModal
              open={inspectionOpen}
              src={inspectionSrc}
              title="Inspection"
              onClose={() => setInspectionOpen(false)}
            />
          )}

          {wo?.id && (
            <AiSuggestModal
              open={aiSuggestOpen}
              onClose={() => setAiSuggestOpen(false)}
              workOrderId={wo.id}
              vehicleId={vehicleIdProp}
              vehicleLabel={vehicleLabel ?? undefined}
              onAdded={() => {
                void fetchLines();
              }}
            />
          )}

          {/* Soft Intake Pop (after save) */}
          {intakeOpen && (
            <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center">
              <div
                className="absolute inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm"
                onClick={dismissIntakeOnce}
              />
              <div className="relative w-full max-w-2xl rounded-3xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-[color:var(--theme-text-secondary)]">
                      Intake (quick)
                    </div>
                    <h3
                      className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]"
                      style={{ fontFamily: "var(--font-blackops), system-ui" }}
                    >
                      What brought them in?
                    </h3>
                    <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                      Saves to WO notes and creates a diagnostic line for the tech.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={dismissIntakeOnce}
                    className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_78%,_var(--theme-surface-page))]"
                  >
                    Skip
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                      Concern (required)
                    </label>
                    <input
                      value={intakeConcern}
                      onChange={(e) => setIntakeConcern(e.target.value)}
                      className="input"
                      placeholder="e.g. No start / rough idle / brake noise…"
                      disabled={intakeSaving}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                      Details (optional)
                    </label>
                    <textarea
                      value={intakeDetails}
                      onChange={(e) => setIntakeDetails(e.target.value)}
                      className="input"
                      rows={3}
                      placeholder="Anything else they said?"
                      disabled={intakeSaving}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                        Contact preference
                      </label>
                      <select
                        value={intakeContactPref}
                        onChange={(e) => setIntakeContactPref(e.target.value)}
                        className="input"
                        disabled={intakeSaving}
                      >
                        <option>Text or call</option>
                        <option>Text only</option>
                        <option>Call only</option>
                        <option>Email</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                        Mileage (optional)
                      </label>
                      <input
                        value={intakeMileage}
                        onChange={(e) => setIntakeMileage(e.target.value)}
                        className="input"
                        placeholder="e.g. 245,000"
                        disabled={intakeSaving}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={saveIntakeAndCreateDiagnosticLine}
                      disabled={intakeSaving}
                      className="
                        rounded-full border border-[color:var(--copper)]/70
                        bg-[color:var(--copper)]/12 px-5 py-2 text-sm font-semibold
                        text-[color:var(--copper)] hover:bg-[color:var(--copper)]/15
                        disabled:opacity-60
                      "
                    >
                      {intakeSaving ? "Saving…" : "Save intake"}
                    </button>

                    <button
                      type="button"
                      onClick={dismissIntakeOnce}
                      disabled={intakeSaving}
                      className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_78%,_var(--theme-surface-page))] disabled:opacity-60"
                    >
                      Skip for now
                    </button>

                    <button
                      type="button"
                      onClick={dismissIntakeForever}
                      disabled={intakeSaving}
                      className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_78%,_var(--theme-surface-page))] disabled:opacity-60"
                    >
                      Don’t ask again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
