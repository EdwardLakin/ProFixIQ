// /features/work-orders/app/work-orders/create/page.tsx (FULL FILE REPLACEMENT)
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardPlus,
  Paperclip,
  Settings2,
} from "lucide-react";

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
import { requestVehicleRecallEnrichment } from "@/features/vehicles/lib/requestRecallEnrichment";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

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
const collapsiblePanel =
  "rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)]";
const childPanel =
  "rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
const subtlePanel =
  "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]";
const softButton =
  "rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]";
const formControlClass = `${ui.input} min-h-11 rounded-xl`;

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
  setVehicleField: (
    field: keyof VehicleWithExtra,
    value: string | null,
  ) => void;

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
  metadata?: {
    inspection_template_id?: string | null;
    inspection_template?: string | null;
    template?: string | null;
    [key: string]: unknown;
  } | null;
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
  if (input.contactPref.trim())
    lines.push(`Contact: ${input.contactPref.trim()}`);
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
    (year === null ||
      !Number.isInteger(year) ||
      year < 1886 ||
      year > maximumYear)
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
  if (booking.notes?.trim())
    lines.push(`Appointment notes: ${booking.notes.trim()}`);
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
            ? (prev.business_name ?? null)
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
  …21766 tokens truncated…og lane: menu_items • Template lane:
                    inspection_templates
                  </span>
                </div>
                <MenuQuickAdd workOrderId={wo.id} />
              </section>
            )}

            {/* Add line */}
            {hasValidatedWorkOrder && wo?.id && (
              <section className={sectionPanel}>
                <div
                  className={cx(
                    "mb-3 flex items-center justify-between border-b pb-3",
                    divider,
                  )}
                >
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
              <div
                className={cx(
                  "mb-3 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between",
                  divider,
                )}
              >
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                  Current lines
                </h2>

                {hasValidatedWorkOrder && wo?.id && (
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
                <div
                  className={cx(
                    "px-4 py-5 text-sm text-[color:var(--theme-text-secondary)]",
                    subtlePanel,
                  )}
                >
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
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              <div className="text-xs text-[color:var(--theme-text-muted)]">
                                {String(ln.job_type ?? "job").replaceAll(
                                  "_",
                                  " ",
                                )}{" "}
                                •{" "}
                                {typeof ln.labor_time === "number"
                                  ? `${ln.labor_time}h`
                                  : "—"}{" "}
                                •{" "}
                                {(ln.status ?? "awaiting").replaceAll("_", " ")}
                              </div>
                              {(ln.complaint || ln.cause || ln.correction) && (
                                <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                                  {ln.complaint
                                    ? `Cmpl: ${ln.complaint}  `
                                    : ""}
                                  {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                                  {ln.correction
                                    ? `| Corr: ${ln.correction}`
                                    : ""}
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
                            className={cx(
                              "p-3 text-sm text-[color:var(--theme-text-secondary)]",
                              subtlePanel,
                            )}
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
                      {lines.every(
                        (ln) => (ln.line_type ?? "job") !== "info",
                      ) && (
                        <p className="text-xs text-[color:var(--theme-text-muted)]">
                          No info/context lines.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Footer actions */}
            <div className="sticky bottom-[calc(0.75rem+var(--safe-bottom))] z-20 rounded-2xl border border-[color:var(--brand-primary)]/25 bg-[color:var(--theme-surface-panel)]/95 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => router.push("/work-orders")}
                  className="min-h-11 px-3 text-sm font-medium text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || isPersistedWorkOrderPending}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(23,71,255,0.28)] transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {loading ? "Creating…" : "Create work order"}
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

          {hasValidatedWorkOrder && wo?.id && (
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
                      Saves to WO notes and creates a diagnostic line for the
                      tech.
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
                      className={formControlClass}
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
                      className={formControlClass}
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
                        className={formControlClass}
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
                        className={formControlClass}
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
