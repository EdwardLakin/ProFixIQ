// features/customers/app/customers/[id]/page.tsx (FULL FILE REPLACEMENT)
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { checkVehicleDuplicates } from "@/features/shared/lib/vehicles/duplicateCheck";
import GuidedPageStepPanel from "@/features/onboarding-v2/components/GuidedPageStepPanel";
import { CustomerCsvImportCard } from "@/features/customers/components/CustomerCsvImportCard";
import { ImportedHistoryRecordCard } from "@/features/work-orders/components/ImportedHistoryRecordCard";
import { usePersistentGuidedOnboardingQuery } from "@/features/onboarding-v2/guided/persistence";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

type DB = Database;

type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type ImportedHistory = Pick<
  DB["public"]["Tables"]["history"]["Row"],
  | "id"
  | "customer_id"
  | "vehicle_id"
  | "work_order_id"
  | "service_date"
  | "description"
  | "notes"
  | "created_at"
  | "work_order_number"
  | "invoice_number"
  | "odometer"
  | "symptom"
  | "cause"
  | "correction"
  | "labor_hours"
  | "labor_sale"
  | "total"
  | "imported_from_session_id"
  | "source_system"
> & {
  vehicles: Pick<
    Vehicle,
    "year" | "make" | "model" | "vin" | "license_plate" | "unit_number"
  > | null;
};
type VehicleMedia = DB["public"]["Tables"]["vehicle_media"]["Row"];

type CustomerSearchRow = Pick<
  Customer,
  | "id"
  | "shop_id"
  | "first_name"
  | "last_name"
  | "name"
  | "business_name"
  | "email"
  | "phone"
  | "phone_number"
  | "created_at"
  | "customer_since"
>;

type NewCustomerType = "individual" | "business" | "fleet";

type NewCustomerDraft = {
  customerType: NewCustomerType;
  customerName: string;
  businessName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

const EMPTY_NEW_CUSTOMER: NewCustomerDraft = {
  customerType: "individual",
  customerName: "",
  businessName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  notes: "",
};

type ParamsShape = Record<string, string | string[]>;

function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const looksLikeUuid = (s: string | null): boolean =>
  !!s && s.includes("-") && s.length >= 36;

const CARD_BASE =
  "rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl";
const CARD_INNER =
  "rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--desktop-item-bg)]";

const STATUS_CHIP_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide";
const STATUS_CHIP: Record<string, string> = {
  awaiting: "bg-sky-900/35 border-sky-400/40 text-sky-100",
  queued: "bg-indigo-900/35 border-indigo-400/40 text-indigo-100",
  in_progress: "bg-amber-900/30 border-amber-400/40 text-amber-100",
  on_hold: "bg-amber-900/35 border-amber-400/45 text-amber-100",
  completed: "bg-emerald-900/30 border-emerald-400/40 text-emerald-100",
  ready_to_invoice: "bg-emerald-900/30 border-emerald-400/40 text-emerald-100",
  invoiced: "bg-teal-900/30 border-teal-400/40 text-teal-100",
};

function chipClass(status: string | null | undefined): string {
  const key = (status ?? "awaiting").toLowerCase();
  return `${STATUS_CHIP_BASE} ${STATUS_CHIP[key] ?? STATUS_CHIP.awaiting}`;
}

function fmtName(c: Pick<Customer, "first_name" | "last_name"> | null): string {
  if (!c) return "—";
  return (
    [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ") || "—"
  );
}
function bestCustomerDisplayName(
  c: Pick<
    Customer,
    | "business_name"
    | "name"
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "phone_number"
  > | null,
): string {
  if (!c) return "—";
  const biz = c.business_name?.trim();
  if (biz) return biz;
  const name = c.name?.trim();
  if (name) return name;
  const person = [c.first_name ?? "", c.last_name ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (person) return person;
  return c.email ?? c.phone ?? c.phone_number ?? "—";
}

function customerSearchHaystack(c: CustomerSearchRow): string {
  return [
    c.business_name,
    c.name,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.phone_number,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .join(" ")
    .toLowerCase();
}

function sortCustomerRows(rows: CustomerSearchRow[]): CustomerSearchRow[] {
  return [...rows].sort((a, b) =>
    bestCustomerDisplayName(a).localeCompare(
      bestCustomerDisplayName(b),
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    ),
  );
}

function fmtVehicleLabel(v: Vehicle): string {
  return (
    [
      v.year != null ? String(v.year) : "",
      v.make ?? "",
      v.model ?? "",
      v.submodel ?? "",
    ]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ") || "Vehicle"
  );
}

function safeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "PPpp");
}

// Historical customer summaries intentionally do not use compactDate(customer?.customer_since ?? customer?.created_at).
function compactDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "MMM yyyy");
}

function formatNumberLike(
  value: string | number | null | undefined,
): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return raw;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    numeric,
  );
}

function formatEngineFuel(vehicle: Vehicle): string | null {
  return (
    [strOrNull(vehicle.engine), strOrNull(vehicle.fuel_type)]
      .filter(Boolean)
      .join(" ") || null
  );
}

function formatDriveBody(vehicle: Vehicle): string | null {
  return (
    [strOrNull(vehicle.drivetrain), strOrNull(vehicle.body_type)]
      .filter(Boolean)
      .join(" ") || null
  );
}

function formatVehicleStatus(value: string | null | undefined): string | null {
  const clean = strOrNull(value);
  if (!clean) return null;
  return clean
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOdometer(
  value: string | number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const formatted = formatNumberLike(value);
  if (!formatted) return null;
  const cleanUnit = strOrNull(unit);
  return cleanUnit ? `${formatted} ${cleanUnit}` : formatted;
}

function formatPlateWithRegion(
  plate: string | null | undefined,
  region: string | null | undefined,
): string | null {
  const cleanPlateValue = strOrNull(plate);
  if (!cleanPlateValue) return null;
  const cleanRegion = strOrNull(region);
  return cleanRegion ? `${cleanPlateValue} (${cleanRegion})` : cleanPlateValue;
}

function isImageUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(url);
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value == null || String(value).trim().length === 0) return null;
  return (
    <div className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
        {label}
      </div>
      <div className="mt-1 min-w-0 break-words text-sm font-medium text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function optString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string") return v.length ? v : null;
  return null;
}

function optNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function compactSecondaryDetails(input: {
  firstName?: string | null;
  lastName?: string | null;
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
  city?: string | null;
  province?: string | null;
}): string | null {
  const contactName = [input.firstName ?? "", input.lastName ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  const phone = input.phone ?? input.phoneNumber ?? null;
  const location = [input.city ?? "", input.province ?? ""]
    .filter(Boolean)
    .join(", ")
    .trim();
  const parts = [contactName, phone ?? "", input.email ?? "", location].filter(
    (part) => part && part !== input.businessName,
  );
  return parts.length ? parts.join(" • ") : null;
}

function asText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.trim().length ? v : "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "—";
}

function strOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

function formatHistoryDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "PP");
}

function formatImportedVehicle(
  vehicle: ImportedHistory["vehicles"] | null | undefined,
): string | null {
  if (!vehicle) return null;
  const label = [
    vehicle.year != null ? String(vehicle.year) : "",
    vehicle.make ?? "",
    vehicle.model ?? "",
  ]
    .filter((part) => part.trim().length > 0)
    .join(" ")
    .trim();
  return label || (vehicle.unit_number ? `Unit ${vehicle.unit_number}` : null);
}

function formatImportedIdentifiers(
  vehicle: ImportedHistory["vehicles"] | null | undefined,
): string | null {
  if (!vehicle) return null;
  return (
    [
      vehicle.vin ? `VIN ${vehicle.vin}` : null,
      vehicle.license_plate ? `Plate ${vehicle.license_plate}` : null,
    ]
      .filter(Boolean)
      .join(" • ") || null
  );
}

function importedHistorySummary(row: ImportedHistory): string | null {
  const complaintCauseCorrection = [
    row.symptom ? `Complaint: ${row.symptom}` : null,
    row.cause ? `Cause: ${row.cause}` : null,
    row.correction ? `Correction: ${row.correction}` : null,
  ].filter(Boolean);

  if (complaintCauseCorrection.length > 0)
    return complaintCauseCorrection.join(" • ");
  return strOrNull(row.description) ?? strOrNull(row.notes);
}

function normalizeEmail(v: string | null | undefined): string | null {
  const email = strOrNull(v);
  return email ? email.toLowerCase() : null;
}

function normalizePhone(v: string | null | undefined): string | null {
  const raw = strOrNull(v);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function splitCustomerName(name: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const clean = strOrNull(name);
  if (!clean) return { firstName: null, lastName: null };
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? null,
  };
}

/** Storage buckets (from your screenshot set). We don't store bucket in DB, so we "probe" candidates. */
const BUCKET_PHOTOS_PRIMARY = "vehicle-photos";
const BUCKET_DOCS_PRIMARY = "vehicle-docs";
/** Legacy fallbacks */
const BUCKET_PHOTOS_LEGACY = "vehicle_photos";
const BUCKET_DOCS_LEGACY = "vehicle_docs";

function bucketCandidates(kind: "photo" | "document"): string[] {
  return kind === "photo"
    ? [BUCKET_PHOTOS_PRIMARY, BUCKET_PHOTOS_LEGACY]
    : [BUCKET_DOCS_PRIMARY, BUCKET_DOCS_LEGACY];
}

type DisplayMedia = VehicleMedia & {
  displayUrl: string | null;
  kind: "photo" | "document";
};

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

function Modal({ title, open, onClose, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[color:var(--desktop-panel-bg-soft)] p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-[color:var(--desktop-border)] bg-[var(--theme-gradient-panel)] shadow-[var(--theme-shadow-medium)]">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--desktop-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-inset)]"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-[color:var(--desktop-border)] px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** IMPORTANT: keep these OUTSIDE the component so the page doesn't remount on every keystroke. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16">
      {children}
    </div>
  );
}

function TopBar({
  rightLabel,
  onBack,
}: {
  rightLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-inset)] hover:text-[color:var(--theme-text-primary)]"
      >
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        Back
      </button>
      <div className="text-[10px] text-[color:var(--theme-text-muted)]">{rightLabel}</div>
    </div>
  );
}

function computeVehicleExtraDetails(
  selectedVehicle: Vehicle | null,
): Array<{ label: string; value: string | number }> {
  if (!selectedVehicle) return [];
  const r = selectedVehicle as unknown;
  if (!isRecord(r)) return [];

  const candidates: Array<{
    label: string;
    key: string;
    kind: "string" | "number";
  }> = [
    { label: "Trim", key: "submodel", kind: "string" },

    { label: "Engine", key: "engine", kind: "string" },
    { label: "Engine Type", key: "engine_type", kind: "string" },
    { label: "Engine Family", key: "engine_family", kind: "string" },

    { label: "Transmission", key: "transmission", kind: "string" },
    { label: "Transmission Type", key: "transmission_type", kind: "string" },

    { label: "Fuel Type", key: "fuel_type", kind: "string" },
    { label: "Body Type", key: "body_type", kind: "string" },
    { label: "Drive Type", key: "drivetrain", kind: "string" },
    { label: "Asset Type", key: "asset_type", kind: "string" },
    { label: "Status", key: "status", kind: "string" },
    { label: "Purchase Date", key: "purchase_date", kind: "string" },
    { label: "In-Service Date", key: "in_service_date", kind: "string" },
    { label: "Last Service Date", key: "last_service_date", kind: "string" },
    { label: "Tags", key: "tags", kind: "string" },
    { label: "Notes", key: "notes", kind: "string" },
  ];

  const out: Array<{ label: string; value: string | number }> = [];
  for (const c of candidates) {
    const v = c.kind === "string" ? optString(r, c.key) : optNumber(r, c.key);
    if (v !== null) out.push({ label: c.label, value: v });
  }
  return out;
}

export default function CustomerProfilePage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();

  const customerGuidedQuery = usePersistentGuidedOnboardingQuery("customers");

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const rawId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const isDirectoryMode = useMemo(() => {
    if (!rawId) return true;
    const v = rawId.toLowerCase();
    return v === "search" || v === "all" || v === "directory";
  }, [rawId]);

  // optional override if you ever do /customers/search?customerId=...
  const forcedCustomerId = useMemo(() => {
    const q = sp.get("customerId");
    return looksLikeUuid(q) ? q : null;
  }, [sp]);

  const effectiveCustomerId = useMemo(() => {
    if (forcedCustomerId) return forcedCustomerId;
    return looksLikeUuid(rawId) ? rawId : null;
  }, [forcedCustomerId, rawId]);

  // ------------------ State ------------------
  const [loading, setLoading] = useState<boolean>(true);
  const [viewError, setViewError] = useState<string | null>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [importedHistory, setImportedHistory] = useState<ImportedHistory[]>([]);
  const [showAllServiceHistory, setShowAllServiceHistory] =
    useState<boolean>(false);
  const [expandedImportedHistoryId, setExpandedImportedHistoryId] = useState<
    string | null
  >(null);

  const [rawVehicleMedia, setRawVehicleMedia] = useState<VehicleMedia[]>([]);
  const [media, setMedia] = useState<DisplayMedia[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);

  // Lightbox
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<DisplayMedia | null>(null);

  // Edit modals
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);

  // Search / directory mode
  const [query, setQuery] = useState<string>("");
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<CustomerSearchRow[]>([]);
  const [directoryRows, setDirectoryRows] = useState<CustomerSearchRow[]>([]);
  const [directoryLoaded, setDirectoryLoaded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Create customer from directory mode
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createCustomerError, setCreateCustomerError] = useState<string | null>(
    null,
  );
  const [
    customerImportPlaceholderVisible,
    setCustomerImportPlaceholderVisible,
  ] = useState(false);
  const [newCustomer, setNewCustomer] =
    useState<NewCustomerDraft>(EMPTY_NEW_CUSTOMER);
  const { updateActiveTab } = useTabs();

  useEffect(() => {
    if (!effectiveCustomerId || !customer) return;
    const name = bestCustomerDisplayName(customer);
    updateActiveTab({
      title: `Customer · ${name}`,
      subtitle:
        vehicles.length > 0
          ? `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`
          : undefined,
      status:
        workOrders.length > 0
          ? `${workOrders.length} work order${workOrders.length === 1 ? "" : "s"}`
          : "Customer file",
    });
  }, [
    customer,
    effectiveCustomerId,
    updateActiveTab,
    vehicles.length,
    workOrders.length,
  ]);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  const vehicleExtraDetails = useMemo(
    () => computeVehicleExtraDetails(selectedVehicle),
    [selectedVehicle],
  );

  const serviceHistory = useMemo(() => {
    const vehicleById = new Map(
      vehicles.map((vehicle) => [vehicle.id, vehicle]),
    );
    const workOrderEntries = workOrders.map((wo) => ({
      kind: "work_order" as const,
      id: wo.id,
      date: String(wo.created_at ?? ""),
      workOrder: wo,
      vehicle: wo.vehicle_id ? (vehicleById.get(wo.vehicle_id) ?? null) : null,
    }));
    const importedEntries = importedHistory.map((row) => ({
      kind: "imported" as const,
      id: row.id,
      date: row.service_date ?? row.created_at ?? "",
      imported: row,
    }));

    return [...workOrderEntries, ...importedEntries].sort((a, b) => {
      const bd = new Date(b.date).getTime();
      const ad = new Date(a.date).getTime();
      return (Number.isFinite(bd) ? bd : 0) - (Number.isFinite(ad) ? ad : 0);
    });
  }, [importedHistory, vehicles, workOrders]);

  const serviceHistorySlice = useMemo(() => {
    if (showAllServiceHistory) return serviceHistory;
    return serviceHistory.slice(0, 8);
  }, [serviceHistory, showAllServiceHistory]);

  const selectedVehicleImportedHistory = useMemo(() => {
    if (!selectedVehicleId) return [];
    return importedHistory.filter(
      (row) => row.vehicle_id === selectedVehicleId,
    );
  }, [importedHistory, selectedVehicleId]);

  // ------------------ Fetch customer file ------------------
  const fetchCustomerFile = useCallback(
    async (customerId: string) => {
      setLoading(true);
      setViewError(null);

      try {
        const { data: cust, error: custErr } = await supabase
          .from("customers")
          .select(
            "id, shop_id, first_name, last_name, name, business_name, email, phone, phone_number, created_at, customer_since, address, city, province, postal_code",
          )
          .eq("id", customerId)
          .maybeSingle();

        if (custErr) throw custErr;

        if (!cust) {
          setCustomer(null);
          setVehicles([]);
          setSelectedVehicleId(null);
          setWorkOrders([]);
          setImportedHistory([]);
          setRawVehicleMedia([]);
          setMedia([]);
          setViewError("Customer not found / not visible.");
          setLoading(false);
          return;
        }

        setCustomer(cust as Customer);

        const { data: vs, error: vsErr } = await supabase
          .from("vehicles")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: true });

        if (vsErr) throw vsErr;

        const directVehicles = (vs ?? []) as Vehicle[];
        const directVehicleIds = directVehicles
          .map((v) => v.id)
          .filter(Boolean);

        const { data: historyRows, error: historyErr } = await supabase
          .from("history")
          .select(
            "id,customer_id,vehicle_id,work_order_id,service_date,description,notes,created_at,work_order_number,invoice_number,odometer,symptom,cause,correction,labor_hours,labor_sale,total,imported_from_session_id,source_system,vehicles:vehicles(year,make,model,vin,license_plate,unit_number)",
          )
          .eq("customer_id", customerId)
          .order("service_date", { ascending: false });

        if (historyErr) throw historyErr;

        const { data: directWos, error: directWoErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        if (directWoErr) throw directWoErr;

        const fallbackWosByVehicle = directVehicleIds.length
          ? await supabase
              .from("work_orders")
              .select("*")
              .in("vehicle_id", directVehicleIds)
              .order("created_at", { ascending: false })
          : { data: [], error: null };

        if (fallbackWosByVehicle.error) throw fallbackWosByVehicle.error;

        const fallbackWosByNameCandidates = [
          cust.business_name,
          cust.name,
          [cust.first_name ?? "", cust.last_name ?? ""]
            .filter(Boolean)
            .join(" ")
            .trim(),
        ].filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        );

        let fallbackWosByName: WorkOrder[] = [];
        if (
          (directWos?.length ?? 0) === 0 &&
          (fallbackWosByVehicle.data?.length ?? 0) === 0
        ) {
          for (const candidate of fallbackWosByNameCandidates) {
            let byNameQuery = supabase
              .from("work_orders")
              .select("*")
              .ilike("customer_name", candidate);
            if (cust.shop_id)
              byNameQuery = byNameQuery.eq("shop_id", cust.shop_id);
            const byNameRes = await byNameQuery
              .order("created_at", { ascending: false })
              .limit(25);
            if (byNameRes.error) throw byNameRes.error;
            if ((byNameRes.data?.length ?? 0) > 0) {
              fallbackWosByName = byNameRes.data as WorkOrder[];
              break;
            }
          }
        }

        const allWorkOrders = [
          ...(directWos ?? []),
          ...(fallbackWosByVehicle.data ?? []),
          ...fallbackWosByName,
        ] as WorkOrder[];
        const workOrdersById = new Map<string, WorkOrder>();
        for (const wo of allWorkOrders) {
          if (!wo?.id) continue;
          workOrdersById.set(wo.id, wo);
        }
        const mergedWorkOrders = Array.from(workOrdersById.values()).sort(
          (a, b) =>
            new Date(String(b.created_at ?? "")).getTime() -
            new Date(String(a.created_at ?? "")).getTime(),
        );

        const fallbackVehicleIds = Array.from(
          new Set(
            mergedWorkOrders
              .map((wo) => wo.vehicle_id)
              .filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              ),
          ),
        ).filter((id) => !directVehicleIds.includes(id));

        const fallbackVehiclesRes = fallbackVehicleIds.length
          ? await supabase
              .from("vehicles")
              .select("*")
              .in("id", fallbackVehicleIds)
          : { data: [], error: null };

        if (fallbackVehiclesRes.error) throw fallbackVehiclesRes.error;

        const vrows = [
          ...directVehicles,
          ...((fallbackVehiclesRes.data ?? []) as Vehicle[]),
        ];
        setVehicles(vrows);

        setSelectedVehicleId((prev) => {
          if (prev && vrows.some((v) => v.id === prev)) return prev;
          return vrows[0]?.id ?? null;
        });

        setWorkOrders(mergedWorkOrders);
        setImportedHistory(
          ((historyRows ?? []) as unknown[]).map((row) => {
            const record = row as ImportedHistory & {
              vehicles?:
                | ImportedHistory["vehicles"]
                | ImportedHistory["vehicles"][];
            };
            return {
              ...record,
              vehicles: Array.isArray(record.vehicles)
                ? (record.vehicles[0] ?? null)
                : (record.vehicles ?? null),
            };
          }),
        );
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load customer file.";
        setViewError(msg);
        setCustomer(null);
        setVehicles([]);
        setSelectedVehicleId(null);
        setWorkOrders([]);
        setImportedHistory([]);
        setRawVehicleMedia([]);
        setMedia([]);
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!effectiveCustomerId) {
      setLoading(false);
      return;
    }
    void fetchCustomerFile(effectiveCustomerId);
  }, [effectiveCustomerId, fetchCustomerFile]);

  // ------------------ Fetch media for selected vehicle ------------------
  const fetchRawMedia = useCallback(
    async (vehicleId: string) => {
      try {
        const { data: rows, error } = await supabase
          .from("vehicle_media")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .order("created_at", { ascending: false });

        if (error) {
          setRawVehicleMedia([]);
          return;
        }
        setRawVehicleMedia((rows ?? []) as VehicleMedia[]);
      } catch {
        setRawVehicleMedia([]);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!selectedVehicleId) {
      setRawVehicleMedia([]);
      setMedia([]);
      return;
    }
    void fetchRawMedia(selectedVehicleId);
  }, [selectedVehicleId, fetchRawMedia]);

  // Turn stored media rows into viewable URLs
  const buildDisplayUrl = useCallback(
    async (
      row: VehicleMedia,
    ): Promise<{ displayUrl: string | null; kind: "photo" | "document" }> => {
      const kind: "photo" | "document" =
        (row.type ?? "").toLowerCase() === "photo" ? "photo" : "document";

      const existing = row.url ?? null;
      const storagePath = (row.storage_path ?? null) as string | null;

      if (!storagePath) {
        return { displayUrl: existing, kind };
      }

      // Probe buckets for a signed url (works for private buckets)
      for (const bucket of bucketCandidates(kind)) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60 * 10);

        if (!error && data?.signedUrl) {
          return { displayUrl: data.signedUrl, kind };
        }
      }

      // fallback to stored publicUrl (if any)
      return { displayUrl: existing, kind };
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!rawVehicleMedia.length) {
        setMedia([]);
        return;
      }

      const out: DisplayMedia[] = [];
      for (const row of rawVehicleMedia) {
        const built = await buildDisplayUrl(row);
        out.push({
          ...(row as VehicleMedia),
          displayUrl: built.displayUrl,
          kind: built.kind,
        });
      }

      if (!cancelled) setMedia(out);
    })();

    return () => {
      cancelled = true;
    };
  }, [rawVehicleMedia, buildDisplayUrl]);

  const getOrLinkShopId = useCallback(
    async (userId: string): Promise<string | null> => {
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
      return ownedShop.data?.id ?? null;
    },
    [supabase],
  );

  const createCustomer = useCallback(async () => {
    setCreateCustomerError(null);

    const customerName = strOrNull(newCustomer.customerName);
    const businessName = strOrNull(newCustomer.businessName);
    const isBusinessLike =
      newCustomer.customerType === "business" ||
      newCustomer.customerType === "fleet";
    const displayName = isBusinessLike ? businessName : customerName;

    if (!displayName) {
      setCreateCustomerError(
        isBusinessLike
          ? "Business name is required."
          : "Customer name is required.",
      );
      return;
    }

    setCreatingCustomer(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id)
        throw new Error("You must be signed in to create a customer.");

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const splitName = splitCustomerName(customerName ?? "");
      const normalizedPhone = normalizePhone(newCustomer.phone);

      const insertRecord: DB["public"]["Tables"]["customers"]["Insert"] = {
        shop_id: shopId,
        user_id: user.id,
        is_fleet: newCustomer.customerType === "fleet",
        name: displayName,
        business_name: isBusinessLike ? businessName : null,
        first_name: isBusinessLike ? splitName.firstName : splitName.firstName,
        last_name: isBusinessLike ? splitName.lastName : splitName.lastName,
        phone: normalizedPhone,
        phone_number: normalizedPhone,
        email: normalizeEmail(newCustomer.email),
        address: strOrNull(newCustomer.address),
        city: strOrNull(newCustomer.city),
        province: strOrNull(newCustomer.province),
        postal_code: strOrNull(newCustomer.postalCode),
        notes: strOrNull(newCustomer.notes),
      };

      const { data, error } = await supabase
        .from("customers")
        .insert(insertRecord)
        .select("id")
        .single();

      if (error || !data?.id) {
        throw new Error(error?.message ?? "Failed to create customer.");
      }

      setCreateCustomerOpen(false);
      setNewCustomer(EMPTY_NEW_CUSTOMER);
      router.push(`/customers/${data.id}`);
    } catch (e: unknown) {
      setCreateCustomerError(
        e instanceof Error ? e.message : "Failed to create customer.",
      );
    } finally {
      setCreatingCustomer(false);
    }
  }, [getOrLinkShopId, newCustomer, router, supabase]);

  // ------------------ Directory search ------------------
  const loadDirectoryRows = useCallback(async () => {
    setSearching(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setDirectoryRows([]);
        setResults([]);
        setDirectoryLoaded(true);
        return;
      }

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) {
        setDirectoryRows([]);
        setResults([]);
        setDirectoryLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, shop_id, first_name, last_name, name, business_name, email, phone, phone_number, created_at, customer_since",
        )
        .eq("shop_id", shopId);

      if (error) {
        setDirectoryRows([]);
        setResults([]);
        setDirectoryLoaded(true);
        return;
      }

      const sortedRows = sortCustomerRows((data ?? []) as CustomerSearchRow[]);
      setDirectoryRows(sortedRows);
      setResults(sortedRows.slice(0, 20));
      setDirectoryLoaded(true);
    } catch {
      setDirectoryRows([]);
      setResults([]);
      setDirectoryLoaded(true);
    } finally {
      setSearching(false);
    }
  }, [getOrLinkShopId, supabase]);

  const runSearch = useCallback(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? directoryRows.filter((row) => customerSearchHaystack(row).includes(q))
      : directoryRows;
    setResults(sortCustomerRows(rows).slice(0, 20));
  }, [directoryRows, query]);

  // Optional: prime query from ?q= ONCE (do not keep syncing, avoids focus/typing weirdness)
  useEffect(() => {
    if (!isDirectoryMode && sp.get("mode") !== "search") return;

    const q = sp.get("q");
    if (q && q.trim().length && !query) {
      setQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirectoryMode]);

  useEffect(() => {
    if (!(isDirectoryMode || sp.get("mode") === "search")) return;
    void loadDirectoryRows();
  }, [isDirectoryMode, sp, loadDirectoryRows]);

  // Debounced live filtering while typing (no URL updates; avoids remount/focus loss)
  useEffect(() => {
    if (!(isDirectoryMode || sp.get("mode") === "search")) return;
    if (!directoryLoaded) return;

    const t = window.setTimeout(() => {
      runSearch();
    }, 150);

    return () => window.clearTimeout(t);
  }, [query, isDirectoryMode, sp, directoryLoaded, runSearch]);

  // ------------------ Upload ------------------
  const handleUpload = useCallback(
    async (file: File, kind: "photo" | "document"): Promise<void> => {
      if (!selectedVehicleId) return;

      const isPhoto = kind === "photo";
      if (isPhoto) setUploadingPhoto(true);
      else setUploadingDoc(true);

      const now = Date.now();
      const safeName = file.name.replaceAll("/", "_");
      const storagePath = `${selectedVehicleId}/${now}-${safeName}`;

      try {
        let uploadedBucket: string | null = null;
        let lastErrMsg: string | null = null;

        for (const bucket of bucketCandidates(kind)) {
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(storagePath, file, {
              upsert: true,
              contentType: file.type || undefined,
            });

          if (!upErr) {
            uploadedBucket = bucket;
            break;
          }
          lastErrMsg = upErr.message;
        }

        if (!uploadedBucket) {
          setViewError(lastErrMsg ?? "Upload failed.");
          return;
        }

        // Store a URL if bucket is public; otherwise it can be null and we’ll use signed urls for display
        const { data: pub } = supabase.storage
          .from(uploadedBucket)
          .getPublicUrl(storagePath);
        const publicUrl = pub?.publicUrl ?? null;

        const insertRow = {
          vehicle_id: selectedVehicleId,
          url: publicUrl,
          type: kind,
          filename: file.name,
          storage_path: storagePath,
        } satisfies DB["public"]["Tables"]["vehicle_media"]["Insert"];

        const { error: insErr } = await supabase
          .from("vehicle_media")
          .insert(insertRow);
        if (insErr) {
          setViewError(insErr.message);
          return;
        }

        await fetchRawMedia(selectedVehicleId);
      } finally {
        if (isPhoto) setUploadingPhoto(false);
        else setUploadingDoc(false);
      }
    },
    [fetchRawMedia, selectedVehicleId, supabase],
  );

  // ------------------ Edit Customer ------------------
  const [custDraft, setCustDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!customer) return;
    const r = customer as unknown as Record<string, unknown>;
    setCustDraft({
      first_name: customer.first_name ?? null,
      last_name: customer.last_name ?? null,
      name: typeof r["name"] === "string" ? (r["name"] as string) : "",
      business_name:
        typeof r["business_name"] === "string"
          ? (r["business_name"] as string)
          : "",
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      phone_number: customer.phone_number ?? null,
      address: typeof r["address"] === "string" ? (r["address"] as string) : "",
      city: typeof r["city"] === "string" ? (r["city"] as string) : "",
      province:
        typeof r["province"] === "string" ? (r["province"] as string) : "",
      postal_code:
        typeof r["postal_code"] === "string"
          ? (r["postal_code"] as string)
          : "",
    });
  }, [customer]);

  const saveCustomer = useCallback(async () => {
    if (!customer) return;

    const updateRecord: Record<string, unknown> = {
      first_name:
        typeof custDraft["first_name"] === "string"
          ? custDraft["first_name"]
          : null,
      last_name:
        typeof custDraft["last_name"] === "string"
          ? custDraft["last_name"]
          : null,
      name:
        typeof custDraft["name"] === "string"
          ? (custDraft["name"] as string) || null
          : null,
      business_name:
        typeof custDraft["business_name"] === "string"
          ? (custDraft["business_name"] as string) || null
          : null,
      email: typeof custDraft["email"] === "string" ? custDraft["email"] : null,
      phone: typeof custDraft["phone"] === "string" ? custDraft["phone"] : null,
      phone_number:
        typeof custDraft["phone_number"] === "string"
          ? custDraft["phone_number"]
          : null,
    };

    // Optional fields (if your schema has them, they'll save; if not, Supabase will error and we show it)
    if (typeof custDraft["address"] === "string")
      updateRecord["address"] = custDraft["address"] || null;
    if (typeof custDraft["city"] === "string")
      updateRecord["city"] = custDraft["city"] || null;
    if (typeof custDraft["province"] === "string")
      updateRecord["province"] = custDraft["province"] || null;
    if (typeof custDraft["postal_code"] === "string")
      updateRecord["postal_code"] = custDraft["postal_code"] || null;

    const { error } = await supabase
      .from("customers")
      .update(updateRecord as DB["public"]["Tables"]["customers"]["Update"])
      .eq("id", customer.id);

    if (error) {
      setViewError(error.message);
      return;
    }

    setEditCustomerOpen(false);
    await fetchCustomerFile(customer.id);
  }, [customer, custDraft, fetchCustomerFile, supabase]);

  // ------------------ Edit Vehicle ------------------
  const [vehDraft, setVehDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!selectedVehicle) return;
    setVehDraft({ ...(selectedVehicle as unknown as Record<string, unknown>) });
  }, [selectedVehicle]);

  const saveVehicle = useCallback(async () => {
    if (!selectedVehicle) return;

    const updateRecord: Record<string, unknown> = {
      year:
        typeof vehDraft["year"] === "number"
          ? vehDraft["year"]
          : (selectedVehicle.year ?? null),
      make:
        typeof vehDraft["make"] === "string"
          ? vehDraft["make"]
          : (selectedVehicle.make ?? null),
      model:
        typeof vehDraft["model"] === "string"
          ? vehDraft["model"]
          : (selectedVehicle.model ?? null),
      vin:
        typeof vehDraft["vin"] === "string"
          ? vehDraft["vin"]
          : (selectedVehicle.vin ?? null),
      license_plate:
        typeof vehDraft["license_plate"] === "string"
          ? vehDraft["license_plate"]
          : ((selectedVehicle as unknown as Record<string, unknown>)[
              "license_plate"
            ] ??
            selectedVehicle.license_plate ??
            null),
      mileage:
        typeof vehDraft["mileage"] === "string"
          ? vehDraft["mileage"]
          : ((selectedVehicle as unknown as Record<string, unknown>)[
              "mileage"
            ] ??
            selectedVehicle.mileage ??
            null),
    };

    // Optional-ish vehicle fields (confirmed by your vehicles table)
    if (typeof vehDraft["unit_number"] === "string")
      updateRecord["unit_number"] = vehDraft["unit_number"] || null;
    if (typeof vehDraft["color"] === "string")
      updateRecord["color"] = vehDraft["color"] || null;
    if (
      vehDraft["engine_hours"] === null ||
      typeof vehDraft["engine_hours"] === "number"
    ) {
      updateRecord["engine_hours"] = vehDraft["engine_hours"];
    }

    // ✅ extra vehicle profile fields
    if (typeof vehDraft["submodel"] === "string")
      updateRecord["submodel"] = vehDraft["submodel"] || null;

    if (typeof vehDraft["engine"] === "string")
      updateRecord["engine"] = vehDraft["engine"] || null;
    if (typeof vehDraft["engine_type"] === "string")
      updateRecord["engine_type"] = vehDraft["engine_type"] || null;
    if (typeof vehDraft["engine_family"] === "string")
      updateRecord["engine_family"] = vehDraft["engine_family"] || null;

    if (typeof vehDraft["transmission"] === "string")
      updateRecord["transmission"] = vehDraft["transmission"] || null;
    if (typeof vehDraft["transmission_type"] === "string")
      updateRecord["transmission_type"] = vehDraft["transmission_type"] || null;

    if (typeof vehDraft["fuel_type"] === "string")
      updateRecord["fuel_type"] = vehDraft["fuel_type"] || null;
    if (typeof vehDraft["drivetrain"] === "string")
      updateRecord["drivetrain"] = vehDraft["drivetrain"] || null;
    for (const key of [
      "state_province",
      "odometer_unit",
      "body_type",
      "asset_type",
      "status",
      "purchase_date",
      "in_service_date",
      "last_service_date",
      "tags",
      "notes",
    ] as const) {
      if (typeof vehDraft[key] === "string")
        updateRecord[key] = vehDraft[key] || null;
    }

    const duplicateCheck = await checkVehicleDuplicates({
      vin: typeof updateRecord["vin"] === "string" ? updateRecord["vin"] : null,
      licensePlate:
        typeof updateRecord["license_plate"] === "string"
          ? updateRecord["license_plate"]
          : null,
      unitNumber:
        typeof updateRecord["unit_number"] === "string"
          ? updateRecord["unit_number"]
          : null,
      customerId: customer?.id ?? null,
      vehicleId: selectedVehicle.id,
    });

    const blockingMatch = duplicateCheck.matches.find(
      (match) => match.match_type === "vin" && match.same_customer === false,
    );
    if (blockingMatch) {
      setViewError(
        "This VIN is already assigned to another customer. Contact shop/admin to move vehicle.",
      );
      return;
    }

    const sameCustomerMatch = duplicateCheck.matches.find(
      (match) => match.same_customer === true,
    );
    if (sameCustomerMatch) {
      setViewError(
        "Vehicle already exists for this customer. Open/edit the existing vehicle instead.",
      );
      return;
    }

    const { error } = await supabase
      .from("vehicles")
      .update(updateRecord as DB["public"]["Tables"]["vehicles"]["Update"])
      .eq("id", selectedVehicle.id)
      .eq("shop_id", customer?.shop_id ?? "");

    if (error) {
      setViewError(error.message);
      return;
    }

    setEditVehicleOpen(false);
    if (customer?.id) await fetchCustomerFile(customer.id);
  }, [customer, fetchCustomerFile, selectedVehicle, supabase, vehDraft]);

  // ------------------ Add Vehicle ------------------
  const [newVeh, setNewVeh] = useState<Record<string, unknown>>({
    year: null,
    make: "",
    model: "",
    submodel: "",
    vin: "",
    license_plate: "",
    mileage: "",
    unit_number: "",
    color: "",
    engine_hours: null,
    engine: "",
    engine_type: "",
    engine_family: "",
    transmission: "",
    transmission_type: "",
    fuel_type: "",
    drivetrain: "",
    state_province: "",
    odometer_unit: "",
    body_type: "",
    asset_type: "",
    status: "",
    purchase_date: "",
    in_service_date: "",
    last_service_date: "",
    tags: "",
    notes: "",
  });

  const createVehicle = useCallback(async () => {
    if (!customer?.id) return;

    const insertRecord: Record<string, unknown> = {
      customer_id: customer.id,
      shop_id: customer.shop_id,
      year: typeof newVeh["year"] === "number" ? newVeh["year"] : null,
      make:
        typeof newVeh["make"] === "string"
          ? (newVeh["make"] as string) || null
          : null,
      model:
        typeof newVeh["model"] === "string"
          ? (newVeh["model"] as string) || null
          : null,
      vin:
        typeof newVeh["vin"] === "string"
          ? (newVeh["vin"] as string) || null
          : null,
      license_plate:
        typeof newVeh["license_plate"] === "string"
          ? (newVeh["license_plate"] as string) || null
          : null,
      mileage:
        typeof newVeh["mileage"] === "string"
          ? (newVeh["mileage"] as string) || null
          : null,
    };

    if (typeof newVeh["unit_number"] === "string")
      insertRecord["unit_number"] = newVeh["unit_number"] || null;
    if (typeof newVeh["color"] === "string")
      insertRecord["color"] = newVeh["color"] || null;
    if (typeof newVeh["engine_hours"] === "number")
      insertRecord["engine_hours"] = newVeh["engine_hours"];

    // ✅ extra vehicle profile fields (confirmed by your vehicles table)
    if (typeof newVeh["submodel"] === "string")
      insertRecord["submodel"] = newVeh["submodel"] || null;

    if (typeof newVeh["engine"] === "string")
      insertRecord["engine"] = newVeh["engine"] || null;
    if (typeof newVeh["engine_type"] === "string")
      insertRecord["engine_type"] = newVeh["engine_type"] || null;
    if (typeof newVeh["engine_family"] === "string")
      insertRecord["engine_family"] = newVeh["engine_family"] || null;

    if (typeof newVeh["transmission"] === "string")
      insertRecord["transmission"] = newVeh["transmission"] || null;
    if (typeof newVeh["transmission_type"] === "string")
      insertRecord["transmission_type"] = newVeh["transmission_type"] || null;

    if (typeof newVeh["fuel_type"] === "string")
      insertRecord["fuel_type"] = newVeh["fuel_type"] || null;
    if (typeof newVeh["drivetrain"] === "string")
      insertRecord["drivetrain"] = newVeh["drivetrain"] || null;
    for (const key of [
      "state_province",
      "odometer_unit",
      "body_type",
      "asset_type",
      "status",
      "purchase_date",
      "in_service_date",
      "last_service_date",
      "tags",
      "notes",
    ] as const) {
      if (typeof newVeh[key] === "string")
        insertRecord[key] = newVeh[key] || null;
    }

    const duplicateCheck = await checkVehicleDuplicates({
      vin: typeof insertRecord["vin"] === "string" ? insertRecord["vin"] : null,
      licensePlate:
        typeof insertRecord["license_plate"] === "string"
          ? insertRecord["license_plate"]
          : null,
      unitNumber:
        typeof insertRecord["unit_number"] === "string"
          ? insertRecord["unit_number"]
          : null,
      customerId: customer.id,
    });

    const blockingMatch = duplicateCheck.matches.find(
      (match) => match.match_type === "vin" && match.same_customer === false,
    );
    if (blockingMatch) {
      setViewError(
        "This VIN is already assigned to another customer. Contact shop/admin to move vehicle.",
      );
      return;
    }

    const sameCustomerMatch = duplicateCheck.matches.find(
      (match) => match.same_customer === true,
    );
    if (sameCustomerMatch) {
      setViewError(
        "Vehicle already exists for this customer. Open/edit the existing vehicle instead.",
      );
      setSelectedVehicleId(sameCustomerMatch.id);
      setAddVehicleOpen(false);
      return;
    }

    const { data, error } = await supabase
      .from("vehicles")
      .insert(insertRecord as DB["public"]["Tables"]["vehicles"]["Insert"])
      .select("id")
      .maybeSingle();

    if (error) {
      setViewError(error.message);
      return;
    }

    setAddVehicleOpen(false);
    await fetchCustomerFile(customer.id);

    const newId = (data as Pick<Vehicle, "id"> | null)?.id ?? null;
    if (newId) setSelectedVehicleId(newId);
  }, [customer, fetchCustomerFile, newVeh, supabase]);

  // ------------------ DIRECTORY MODE ------------------
  if (isDirectoryMode || sp.get("mode") === "search") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-5 text-[color:var(--theme-text-primary)]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/70 hover:text-[color:var(--theme-text-primary)]"
          >
            ← Back
          </button>
          <div className="text-xs text-[color:var(--theme-text-muted)]">Customers</div>
        </div>

        <GuidedPageStepPanel
          actions={{
            customers: {
              label: "Prepare customer CSV import",
              description:
                "Customer CSV import will be connected here. You can safely create customers manually now without leaving this page.",
              onClick: () => setCustomerImportPlaceholderVisible(true),
            },
          }}
        />

        {customerImportPlaceholderVisible ? (
          <div
            className={`${CARD_BASE} border-[var(--accent-copper-soft)]/55 p-4 text-sm text-[color:var(--theme-text-primary)]`}
            data-guided-customer-import-placeholder
          >
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper,#C57A4A)]">
              Customer import
            </div>
            <p className="mt-2">
              Customer CSV import will be connected here. For now, use{" "}
              <span className="font-semibold text-[color:var(--theme-text-primary)]">
                + Create Customer
              </span>{" "}
              to add records safely.
            </p>
            <button
              type="button"
              onClick={() => {
                setCreateCustomerError(null);
                setCreateCustomerOpen(true);
              }}
              className="mt-3 rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] hover:brightness-110"
            >
              + Create Customer
            </button>
          </div>
        ) : null}

        <CustomerCsvImportCard
          guidedQuery={customerGuidedQuery}
          onCreateCustomer={() => setCreateCustomerOpen(true)}
        />

        <div className={`${CARD_BASE} p-4`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className="text-2xl font-semibold text-[color:var(--theme-text-primary)]"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                Customer Files
              </h1>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Search by name, email, or phone. Open a customer to view the
                full file.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:w-[680px] sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setCreateCustomerError(null);
                  setCreateCustomerOpen(true);
                }}
                className="rounded-xl border border-[var(--accent-copper-soft)]/55 bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper)] hover:bg-[color:var(--theme-surface-inset)]"
              >
                + Create Customer
              </button>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder="Search customers..."
                className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110 disabled:opacity-60"
                disabled={searching}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            {results.length === 0 ? (
              <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
                {searching
                  ? "Searching…"
                  : directoryRows.length === 0
                    ? "No customers found yet."
                    : "No customers match your search."}
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => {
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => router.push(`/customers/${r.id}`)}
                      className={`${CARD_INNER} w-full p-3 text-left hover:border-[var(--accent-copper-soft)]/65`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            {bestCustomerDisplayName(r)}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[color:var(--theme-text-secondary)]">
                            {r.business_name?.trim() &&
                            (r.first_name || r.last_name)
                              ? fmtName(r)
                              : r.business_name?.trim()
                                ? "—"
                                : r.name?.trim()
                                  ? fmtName(r)
                                  : "—"}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                            {compactSecondaryDetails({
                              firstName: r.first_name,
                              lastName: r.last_name,
                              businessName: r.business_name,
                              email: r.email,
                              phone: r.phone,
                              phoneNumber: r.phone_number,
                            }) ?? "No contact details imported"}
                          </div>
                        </div>
                        <div className="text-[10px] text-[color:var(--theme-text-muted)]">
                          {safeDate(r.created_at)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <Modal
          title="Create customer"
          open={createCustomerOpen}
          onClose={() => {
            if (creatingCustomer) return;
            setCreateCustomerOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setCreateCustomerOpen(false)}
                disabled={creatingCustomer}
                className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-inset)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createCustomer()}
                disabled={creatingCustomer}
                className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110 disabled:opacity-60"
              >
                {creatingCustomer ? "Creating…" : "Create customer"}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              Use this as a secondary management path. The primary launch flow
              remains Work Order → Customer → Vehicle.
            </div>

            {createCustomerError ? (
              <div className="whitespace-pre-wrap rounded-xl border border-red-500/35 bg-red-950/50 p-3 text-sm text-red-200">
                {createCustomerError}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Customer type
                <select
                  value={newCustomer.customerType}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      customerType: e.target.value as NewCustomerType,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                >
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                  <option value="fleet">Fleet</option>
                </select>
              </label>

              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                {newCustomer.customerType === "individual"
                  ? "Customer name"
                  : "Business name"}
                <input
                  value={
                    newCustomer.customerType === "individual"
                      ? newCustomer.customerName
                      : newCustomer.businessName
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewCustomer((draft) =>
                      draft.customerType === "individual"
                        ? { ...draft, customerName: value }
                        : { ...draft, businessName: value },
                    );
                  }}
                  placeholder={
                    newCustomer.customerType === "individual"
                      ? "Jane Doe"
                      : "Acme Fleet Services"
                  }
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
            </div>

            {newCustomer.customerType !== "individual" ? (
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Contact name
                <input
                  value={newCustomer.customerName}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      customerName: e.target.value,
                    }))
                  }
                  placeholder="Primary contact"
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Phone
                <input
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      phone: e.target.value,
                    }))
                  }
                  placeholder="(555) 555-1234"
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Email
                <input
                  value={newCustomer.email}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      email: e.target.value,
                    }))
                  }
                  placeholder="customer@example.com"
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Address
              <input
                value={newCustomer.address}
                onChange={(e) =>
                  setNewCustomer((draft) => ({
                    ...draft,
                    address: e.target.value,
                  }))
                }
                placeholder="Street address"
                className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                City
                <input
                  value={newCustomer.city}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      city: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                State / Province
                <input
                  value={newCustomer.province}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      province: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Postal code
                <input
                  value={newCustomer.postalCode}
                  onChange={(e) =>
                    setNewCustomer((draft) => ({
                      ...draft,
                      postalCode: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Notes
              <textarea
                value={newCustomer.notes}
                onChange={(e) =>
                  setNewCustomer((draft) => ({
                    ...draft,
                    notes: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Launch-essential customer notes"
                className="mt-1 w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
              />
            </label>
          </div>
        </Modal>
      </div>
    );
  }

  // ------------------ Non-UUID guard ------------------
  if (!effectiveCustomerId) {
    return (
      <PageShell>
        <div className={`${CARD_BASE} p-4`}>
          <div className="text-sm text-[color:var(--theme-text-primary)]">
            This route expects a customer id.
          </div>
          <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
            Use{" "}
            <span className="font-mono text-[color:var(--theme-text-primary)]">
              /customers/search
            </span>{" "}
            to open the customer directory.
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)]"
              onClick={() => router.push("/customers/search")}
            >
              Open Customer Directory
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ------------------ CUSTOMER FILE MODE ------------------
  return (
    <PageShell>
      <TopBar rightLabel="Customer File" onBack={() => router.back()} />

      <GuidedPageStepPanel />

      {viewError && (
        <div className="mb-4 whitespace-pre-wrap rounded-2xl border border-red-500/35 bg-red-950/50 p-3 text-sm text-red-200 shadow-[var(--theme-shadow-medium)]">
          {viewError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          <div className={`${CARD_BASE} h-24 animate-pulse`} />
          <div className={`${CARD_BASE} h-40 animate-pulse`} />
          <div className={`${CARD_BASE} h-56 animate-pulse`} />
        </div>
      ) : !customer ? (
        <div className={`${CARD_BASE} p-4 text-sm text-red-300`}>
          Customer not found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Header */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  {(() => {
                    const biz = customer.business_name?.trim() ?? "";
                    const title = bestCustomerDisplayName(customer);
                    const customerRecord = customer as unknown as Record<
                      string,
                      unknown
                    >;

                    return (
                      <>
                        <h1
                          className="truncate text-2xl font-semibold text-[color:var(--theme-text-primary)] sm:text-3xl"
                          style={{
                            fontFamily: "var(--font-blackops), system-ui",
                          }}
                        >
                          {title}
                        </h1>

                        {biz && (customer.first_name || customer.last_name) ? (
                          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                            {fmtName(customer)}
                          </div>
                        ) : null}

                        <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                          {compactSecondaryDetails({
                            firstName: customer.first_name,
                            lastName: customer.last_name,
                            businessName: customer.business_name,
                            email: customer.email,
                            phone: customer.phone,
                            phoneNumber: customer.phone_number,
                            city:
                              typeof customerRecord["city"] === "string"
                                ? customerRecord["city"]
                                : null,
                            province:
                              typeof customerRecord["province"] === "string"
                                ? customerRecord["province"]
                                : null,
                          }) ?? "No contact details imported"}
                        </div>
                      </>
                    );
                  })()}

                  <div className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
                    <div>
                      {asText(
                        (customer as unknown as Record<string, unknown>)[
                          "address"
                        ],
                      )}
                    </div>
                    <div>
                      {[
                        (customer as unknown as Record<string, unknown>)[
                          "city"
                        ],
                        (customer as unknown as Record<string, unknown>)[
                          "province"
                        ],
                        (customer as unknown as Record<string, unknown>)[
                          "postal_code"
                        ],
                      ]
                        .map((x) => (typeof x === "string" ? x : ""))
                        .filter((x) => x.length)
                        .join(", ") || "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditCustomerOpen(true)}
                    className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/65"
                  >
                    Edit customer
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/work-orders/create?customerId=${customer.id}${
                          selectedVehicleId
                            ? `&vehicleId=${selectedVehicleId}`
                            : ""
                        }`,
                      )
                    }
                    className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
                  >
                    Create Work Order
                  </button>
                </div>
              </div>
            </div>
            {/* Vehicles */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)] sm:text-base">
                    Vehicles
                  </h2>
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Select a vehicle to view details and files.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddVehicleOpen(true)}
                    className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/65"
                  >
                    + Add vehicle
                  </button>

                  {vehicles.length > 0 ? (
                    <select
                      value={selectedVehicleId ?? ""}
                      onChange={(e) =>
                        setSelectedVehicleId(e.target.value || null)
                      }
                      className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:outline-none"
                    >
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {fmtVehicleLabel(v)}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {selectedVehicle ? (
                    <button
                      type="button"
                      onClick={() => setEditVehicleOpen(true)}
                      className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/65"
                    >
                      Edit vehicle
                    </button>
                  ) : null}
                </div>
              </div>

              {vehicles.length === 0 ? (
                <div
                  className={`${CARD_INNER} mt-3 p-3 text-sm text-[color:var(--theme-text-secondary)]`}
                >
                  No vehicles linked to this customer yet.
                </div>
              ) : selectedVehicle ? (
                <div className="mt-3 space-y-3">
                  <div className={`${CARD_INNER} p-4`}>
                    <div className="min-w-0 space-y-2">
                      <div className="break-words text-lg font-semibold leading-tight text-[color:var(--theme-text-primary)] sm:text-xl">
                        <span aria-hidden className="mr-2">
                          🚗
                        </span>
                        {fmtVehicleLabel(selectedVehicle)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <DetailRow
                        label="VIN"
                        value={selectedVehicle.vin ?? "Not recorded"}
                      />
                      <DetailRow
                        label="Plate"
                        value={formatPlateWithRegion(
                          selectedVehicle.license_plate,
                          selectedVehicle.state_province,
                        )}
                      />
                      <DetailRow
                        label="Mileage"
                        value={formatOdometer(
                          selectedVehicle.mileage,
                          selectedVehicle.odometer_unit,
                        )}
                      />
                      <DetailRow
                        label="Engine"
                        value={formatEngineFuel(selectedVehicle)}
                      />
                      <DetailRow
                        label="Drive"
                        value={formatDriveBody(selectedVehicle)}
                      />
                      <DetailRow
                        label="Status"
                        value={
                          formatVehicleStatus(selectedVehicle.status) ??
                          "Customer Vehicle"
                        }
                      />
                      <DetailRow
                        label="Customer since"
                        value={compactDate(customer?.customer_since)}
                      />
                      <DetailRow
                        label="Unit #"
                        value={selectedVehicle.unit_number}
                      />
                      <DetailRow label="Color" value={selectedVehicle.color} />
                    </div>

                    {vehicleExtraDetails.length > 0 ? (
                      <div className="mt-3">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                          Additional vehicle details
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {vehicleExtraDetails.map((it) => (
                            <DetailRow
                              key={it.label}
                              label={it.label}
                              value={it.value}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedVehicleImportedHistory.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-[var(--accent-copper-soft)]/35 bg-[color:var(--theme-surface-inset)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                            Imported history for selected vehicle
                          </div>
                          <span className="rounded-full border border-[var(--accent-copper-soft)]/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper,#C57A4A)]">
                            Read-only
                          </span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedVehicleImportedHistory
                            .slice(0, 3)
                            .map((row) => {
                              const expanded =
                                expandedImportedHistoryId === row.id;
                              return (
                                <div key={row.id} className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedImportedHistoryId((current) =>
                                        current === row.id ? null : row.id,
                                      )
                                    }
                                    className="w-full rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-left transition hover:border-[var(--accent-copper-soft)]/65 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]/45"
                                    aria-expanded={expanded}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                                          {formatHistoryDate(row.service_date)}
                                        </div>
                                        <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                                          {[
                                            row.work_order_number
                                              ? `WO ${row.work_order_number}`
                                              : null,
                                            row.invoice_number
                                              ? `Invoice ${row.invoice_number}`
                                              : null,
                                            row.odometer != null
                                              ? `${formatNumberLike(row.odometer)} mi`
                                              : null,
                                          ]
                                            .filter(Boolean)
                                            .join(" • ") ||
                                            "Imported service record"}
                                        </div>
                                      </div>
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-copper,#C57A4A)]">
                                        {expanded ? "Hide" : "Details"}
                                      </span>
                                    </div>
                                  </button>
                                  {expanded ? (
                                    <ImportedHistoryRecordCard
                                      row={row}
                                      serviceDateLabel={formatHistoryDate(
                                        row.service_date,
                                      )}
                                      vehicleLabel={formatImportedVehicle(
                                        row.vehicles,
                                      )}
                                      vehicleIdentifiers={formatImportedIdentifiers(
                                        row.vehicles,
                                      )}
                                      summary={importedHistorySummary(row)}
                                      compact
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {/* Service History */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)] sm:text-base">
                    Service History
                  </h2>
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Unified timeline of live ProFixIQ work orders and read-only
                    imported vehicle history.
                  </p>
                </div>

                {serviceHistory.length > 8 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllServiceHistory((v) => !v)}
                    className="text-[11px] font-semibold text-[rgba(184,115,51,0.95)] hover:underline"
                  >
                    {showAllServiceHistory ? "Show less" : "Show all"}
                  </button>
                ) : null}
              </div>

              {serviceHistory.length === 0 ? (
                <div
                  className={`${CARD_INNER} mt-3 p-3 text-sm text-[color:var(--theme-text-secondary)]`}
                >
                  No service history yet.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {serviceHistorySlice.map((entry) => {
                    if (entry.kind === "work_order") {
                      const wo = entry.workOrder;
                      const status = String(
                        ((wo as unknown as Record<string, unknown>)[
                          "status"
                        ] as string | null) ?? "awaiting",
                      );
                      const normalizedStatus = status.toLowerCase();
                      const lifecycleLabel =
                        normalizedStatus.includes("complete") ||
                        normalizedStatus.includes("invoice")
                          ? "Completed"
                          : normalizedStatus.includes("progress")
                            ? "In progress"
                            : "Active";
                      const customId = (
                        wo as unknown as Record<string, unknown>
                      )["custom_id"] as string | undefined;
                      const vehicle = entry.vehicle;
                      const vehicleLabel = vehicle
                        ? fmtVehicleLabel(vehicle)
                        : null;

                      return (
                        <button
                          key={`wo-${wo.id}`}
                          type="button"
                          onClick={() => router.push(`/work-orders/${wo.id}`)}
                          className={`${CARD_INNER} w-full p-3 text-left hover:border-[var(--accent-copper-soft)]/65`}
                          title="Open work order"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                                {customId
                                  ? `WO ${customId}`
                                  : `WO #${wo.id.slice(0, 8)}`}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                                {safeDate(wo.created_at)}
                                {vehicleLabel ? ` • ${vehicleLabel}` : ""}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className={chipClass(status)}>
                                {lifecycleLabel}
                              </span>
                              <span className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                                {status.replaceAll("_", " ")}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    }

                    const row = entry.imported;
                    return (
                      <ImportedHistoryRecordCard
                        key={`imported-${row.id}`}
                        row={row}
                        serviceDateLabel={formatHistoryDate(
                          row.service_date ?? row.created_at,
                        )}
                        vehicleLabel={formatImportedVehicle(row.vehicles)}
                        vehicleIdentifiers={formatImportedIdentifiers(
                          row.vehicles,
                        )}
                        summary={importedHistorySummary(row)}
                        collapsed={expandedImportedHistoryId !== row.id}
                        onToggle={() =>
                          setExpandedImportedHistoryId((current) =>
                            current === row.id ? null : row.id,
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <aside className="space-y-6">
            <div className={`${CARD_BASE} p-4`}>
              <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Upload Vehicle Photos
              </h3>
              <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                Condition photos, damage evidence, before/after.
              </p>
              <div className="mt-3">
                <input
                  type="file"
                  accept="image/*"
                  disabled={!selectedVehicleId || uploadingPhoto}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f, "photo");
                    e.currentTarget.value = "";
                  }}
                  className="w-full text-sm text-[color:var(--theme-text-primary)]"
                />
                {uploadingPhoto ? (
                  <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Uploading photo…
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`${CARD_BASE} p-4`}>
              <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Upload Documents
              </h3>
              <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                Registration, CVIP, inspection PDFs, misc docs.
              </p>
              <div className="mt-3">
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  disabled={!selectedVehicleId || uploadingDoc}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f, "document");
                    e.currentTarget.value = "";
                  }}
                  className="w-full text-sm text-[color:var(--theme-text-primary)]"
                />
                {uploadingDoc ? (
                  <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Uploading document…
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`${CARD_BASE} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    Vehicle Gallery & Files
                  </h3>
                  <p className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    Files shown for the selected vehicle.
                  </p>
                </div>
                {selectedVehicleId ? (
                  <button
                    type="button"
                    onClick={() => void fetchRawMedia(selectedVehicleId)}
                    className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-[11px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/65"
                  >
                    Refresh
                  </button>
                ) : null}
              </div>

              {!selectedVehicleId ? (
                <div
                  className={`${CARD_INNER} mt-3 p-3 text-sm text-[color:var(--theme-text-secondary)]`}
                >
                  Select a vehicle to view files.
                </div>
              ) : media.length === 0 ? (
                <div
                  className={`${CARD_INNER} mt-3 p-3 text-sm text-[color:var(--theme-text-secondary)]`}
                >
                  No files uploaded yet.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {media.map((m) => {
                    const url = m.displayUrl ?? m.url ?? null;
                    const img = m.kind === "photo" || isImageUrl(url);
                    const title = m.filename ?? m.type ?? "file";

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setViewerItem(m);
                          setViewerOpen(true);
                        }}
                        className="block overflow-hidden rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] hover:border-[var(--accent-copper-soft)]/65"
                        title={title}
                      >
                        {img && url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt={title}
                            className="h-28 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-28 w-full items-center justify-center px-2 text-center text-[11px] text-[color:var(--theme-text-secondary)]">
                            Open file
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Viewer (fixes “opens new tab but never renders”) */}
      <Modal
        title={viewerItem?.filename ?? "File"}
        open={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setViewerItem(null);
        }}
        footer={
          viewerItem?.displayUrl ? (
            <a
              href={viewerItem.displayUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-soft)]/65"
            >
              Open in new tab
            </a>
          ) : null
        }
      >
        {!viewerItem ? (
          <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
            No file selected.
          </div>
        ) : !viewerItem.displayUrl ? (
          <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
            This file doesn’t have a viewable URL yet (likely a private bucket
            without a signed URL).
          </div>
        ) : viewerItem.kind === "photo" || isImageUrl(viewerItem.displayUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={viewerItem.displayUrl}
            alt={viewerItem.filename ?? "photo"}
            className="w-full rounded-xl"
          />
        ) : (
          <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
            Document ready. Use “Open in new tab”.
          </div>
        )}
      </Modal>

      {/* Edit Customer */}
      <Modal
        title="Edit customer"
        open={editCustomerOpen}
        onClose={() => setEditCustomerOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditCustomerOpen(false)}
              className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--theme-border-soft)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveCustomer()}
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
            >
              Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["First name", "first_name"],
              ["Last name", "last_name"],
              ["Business name", "business_name"],
              ["Display name", "name"],
              ["Email", "email"],
              ["Phone", "phone"],
              ["Alt phone", "phone_number"],
              ["Address", "address"],
              ["City", "city"],
              ["Province", "province"],
              ["Postal code", "postal_code"],
            ] as const
          ).map(([label, key]) => (
            <div key={key} className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                {label}
              </div>
              <input
                value={String(custDraft[key] ?? "")}
                onChange={(e) =>
                  setCustDraft((p) => ({ ...p, [key]: e.target.value }))
                }
                className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
              />
            </div>
          ))}
        </div>
      </Modal>

      {/* Edit Vehicle */}
      <Modal
        title="Edit vehicle"
        open={editVehicleOpen}
        onClose={() => setEditVehicleOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditVehicleOpen(false)}
              className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--theme-border-soft)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveVehicle()}
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
            >
              Save
            </button>
          </>
        }
      >
        {!selectedVehicle ? (
          <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
            No vehicle selected.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["Year", "year"],
                ["Make", "make"],
                ["Model", "model"],
                ["Trim", "submodel"],
                ["VIN", "vin"],
                ["License plate", "license_plate"],
                ["State / province", "state_province"],
                ["Mileage / odometer", "mileage"],
                ["Odometer unit", "odometer_unit"],
                ["Unit #", "unit_number"],
                ["Color", "color"],
                ["Engine hours", "engine_hours"],
                ["Engine", "engine"],
                ["Engine type", "engine_type"],
                ["Engine family", "engine_family"],
                ["Transmission", "transmission"],
                ["Transmission type", "transmission_type"],
                ["Fuel type", "fuel_type"],
                ["Body type", "body_type"],
                ["Drive type", "drivetrain"],
                ["Asset type", "asset_type"],
                ["Status", "status"],
                ["Purchase date", "purchase_date"],
                ["In-service date", "in_service_date"],
                ["Last service date", "last_service_date"],
                ["Tags", "tags"],
                ["Notes", "notes"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                  {label}
                </div>
                <input
                  value={String(vehDraft[key] ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setVehDraft((p) => {
                      if (key === "year" || key === "engine_hours") {
                        const n = raw.trim().length ? Number(raw) : null;
                        return {
                          ...p,
                          [key]: Number.isFinite(n as number) ? n : null,
                        };
                      }
                      return { ...p, [key]: raw };
                    });
                  }}
                  className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Add Vehicle */}
      <Modal
        title="Add vehicle"
        open={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddVehicleOpen(false)}
              className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--theme-border-soft)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createVehicle()}
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-[12px] font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
              disabled={!customer}
            >
              Create
            </button>
          </>
        }
      >
        {!customer ? (
          <div className={`${CARD_INNER} p-3 text-sm text-[color:var(--theme-text-secondary)]`}>
            No customer loaded.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["Year", "year"],
                ["Make", "make"],
                ["Model", "model"],
                ["Trim", "submodel"],
                ["VIN", "vin"],
                ["License plate", "license_plate"],
                ["State / province", "state_province"],
                ["Mileage / odometer", "mileage"],
                ["Odometer unit", "odometer_unit"],
                ["Unit #", "unit_number"],
                ["Color", "color"],
                ["Engine hours", "engine_hours"],
                ["Engine", "engine"],
                ["Engine type", "engine_type"],
                ["Engine family", "engine_family"],
                ["Transmission", "transmission"],
                ["Transmission type", "transmission_type"],
                ["Fuel type", "fuel_type"],
                ["Body type", "body_type"],
                ["Drive type", "drivetrain"],
                ["Asset type", "asset_type"],
                ["Status", "status"],
                ["Purchase date", "purchase_date"],
                ["In-service date", "in_service_date"],
                ["Last service date", "last_service_date"],
                ["Tags", "tags"],
                ["Notes", "notes"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                  {label}
                </div>
                <input
                  value={String(newVeh[key] ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setNewVeh((p) => {
                      if (key === "year" || key === "engine_hours") {
                        const n = raw.trim().length ? Number(raw) : null;
                        return {
                          ...p,
                          [key]: Number.isFinite(n as number) ? n : null,
                        };
                      }
                      return { ...p, [key]: raw };
                    });
                  }}
                  className="w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
