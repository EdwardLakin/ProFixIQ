// /features/work-orders/app/work-orders/create/page.tsx (FULL FILE REPLACEMENT)
"use client";


import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";
import { toast } from "sonner";

import VinCaptureModal from "app/vehicle/VinCaptureModal";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import { useCustomerVehicleDraft } from "app/work-orders/state/useCustomerVehicleDraft";

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
  "rounded-2xl border border-white/10 bg-black/40 shadow-[0_24px_70px_rgba(0,0,0,0.65)]";
const divider = "border-white/10";

/* =============================================================================
   Types & helpers
============================================================================= */
type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type LineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderLine = LineRow;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

// Allow a couple extra fields used by UI/drafts without using `any`
type CustomerWithBusiness = SessionCustomer & { business_name?: string | null };
type VehicleWithExtra = SessionVehicle & {
  engine?: string | null;
  fuel_type?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
};

type WorkOrderWaiterRow = WorkOrderRow & { is_waiter?: boolean | null };

// ✅ VIN decode payload can be string/number, but we normalize before storing
type VinDecoded = {
  vin: string;
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  fuelType?: string | null;
  driveType?: string | null;
  transmission?: string | null;
};

type CustomerRowWithBusiness = CustomerRow & { business_name?: string | null };

type CreateWoRpcRow = Pick<
  WorkOrderRow,
  "id" | "shop_id" | "custom_id" | "customer_id" | "vehicle_id"
> & {
  is_waiter?: boolean | null;
};

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
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

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
        transmission: dv.transmission ?? prev.transmission ?? null,
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
      setVehicle((v) => ({ ...v, [field]: value }));
      cvDraft.setVehicleField(field, value);
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

  // Uploads
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // UI state
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError] = useTabState("error", "");
  const [inviteNotice, setInviteNotice] =
    useTabState<string>("inviteNotice", "");
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", false);

  // Current user id (for VIN modal)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
        fuel_type: draft.vehicle?.fuel_type ?? prev.fuel_type ?? null,
        drivetrain: draft.vehicle?.drivetrain ?? prev.drivetrain ?? null,
        transmission: draft.vehicle?.transmission ?? prev.transmission ?? null,
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
  useEffect(() => {
    if (!wo) return;
    const flag = (wo as WorkOrderWaiterRow).is_waiter ?? false;
    setIsWaiter(Boolean(flag));
  }, [wo, setIsWaiter]);

  // get current user id (for VIN modal)
  useEffect((): void => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    })();
  }, [supabase]);

  async function getOrLinkShopId(userId: string): Promise<string | null> {
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
  }

  const buildCustomerInsert = (c: CustomerWithBusiness, shopId: string) => ({
    business_name: strOrNull(c.business_name ?? null),
    first_name: strOrNull(c.first_name),
    last_name: strOrNull(c.last_name),
    phone: strOrNull(c.phone),
    email: strOrNull(c.email),
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
    vin: strOrNull(v.vin),
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
    transmission: strOrNull(v.transmission ?? null),
    fuel_type: strOrNull(v.fuel_type ?? null),
    drivetrain: strOrNull(v.drivetrain ?? null),

    shop_id: shopId,
  });

  // ✅ patch update (only include fields that have values)
  const buildVehiclePatch = (
    v: VehicleWithExtra,
    customerIdIn: string,
  ): Partial<VehicleRow> => {
    const patch: Partial<VehicleRow> = {
      customer_id: customerIdIn,
    };

    const vin = strOrNull(v.vin);
    if (vin !== null) patch.vin = vin;

    const yr = numOrNull(v.year);
    if (yr !== null) patch.year = yr;

    const make = strOrNull(v.make);
    if (make !== null) patch.make = make;

    const model = strOrNull(v.model);
    if (model !== null) patch.model = model;

    const plate = strOrNull(v.license_plate);
    if (plate !== null) patch.license_plate = plate;

    const mileage = strOrNull(v.mileage);
    if (mileage !== null) patch.mileage = mileage;

    const unit = strOrNull(v.unit_number);
    if (unit !== null) patch.unit_number = unit;

    const color = strOrNull(v.color);
    if (color !== null) patch.color = color;

    const eh = numOrNull(v.engine_hours);
    if (eh !== null) patch.engine_hours = eh;

    // ✅ NEW
    const engine = strOrNull(v.engine ?? null);
    if (engine !== null) patch.engine = engine;

    const trans = strOrNull(v.transmission ?? null);
    if (trans !== null) patch.transmission = trans;

    const fuel = strOrNull(v.fuel_type ?? null);
    if (fuel !== null) patch.fuel_type = fuel;

    const drive = strOrNull(v.drivetrain ?? null);
    if (drive !== null) patch.drivetrain = drive;

    return patch;
  };

  const hydrateCustomerFromRow = useCallback(
    (row: CustomerRowWithBusiness): CustomerWithBusiness => ({
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      phone: getStrField(row, "phone"),
      email: row.email ?? null,
      address: getStrField(row, "address"),
      city: getStrField(row, "city"),
      province: getStrField(row, "province"),
      postal_code: getStrField(row, "postal_code"),
      business_name: row.business_name ?? null,
    }),
    [],
  );

  // Read query params (prefill)
  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    if (v) {
      setPrefillVehicleId(v);
      setSourceFlags((s) => ({ ...s, queryVehicle: true }));
    }
    if (c) {
      setPrefillCustomerId(c);
      setSourceFlags((s) => ({ ...s, queryCustomer: true }));
    }
  }, [searchParams, setPrefillVehicleId, setPrefillCustomerId, setSourceFlags]);

  // Prefill from DB → session shapes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (prefillCustomerId) {
          const { data } = await supabase
            .from("customers")
            .select("*")
            .eq("id", prefillCustomerId)
            .single();
          if (!cancelled && data) {
            setCustomer(hydrateCustomerFromRow(data as CustomerRowWithBusiness));
            setCustomerId(data.id);
          }
        }
        if (prefillVehicleId) {
          const { data } = await supabase
            .from("vehicles")
            .select(
              "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, engine, transmission, fuel_type, drivetrain, customer_id",
            )
            .eq("id", prefillVehicleId)
            .single();
          if (!cancelled && data) {
            setVehicle({
              vin: data.vin ?? null,
              year: data.year != null ? String(data.year) : null,
              make: data.make ?? null,
              model: data.model ?? null,
              license_plate: data.license_plate ?? null,
              mileage: getStrField(data, "mileage"),
              unit_number: getStrField(data, "unit_number"),
              color: getStrField(data, "color"),
              engine_hours:
                data.engine_hours != null ? String(data.engine_hours) : null,

              // ✅ NEW
              engine: getStrField(data, "engine"),
              transmission: getStrField(data, "transmission"),
              fuel_type: getStrField(data, "fuel_type"),
              drivetrain: getStrField(data, "drivetrain"),
            });
            setVehicleId(data.id);

            if (!customerId && data.customer_id) {
              const { data: cust } = await supabase
                .from("customers")
                .select("*")
                .eq("id", data.customer_id)
                .maybeSingle();
              if (cust) {
                setCustomer(hydrateCustomerFromRow(cust as CustomerRowWithBusiness));
                setCustomerId(cust.id);
              }
            }
          }
        }
      } catch {
        /* noop */
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
    customerId,
    hydrateCustomerFromRow,
  ]);

  async function ensureCustomer(shopId: string): Promise<CustomerRowWithBusiness> {
    if (customerId) {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();
      if (data) return data as CustomerRowWithBusiness;
    }

    let q = supabase.from("customers").select("*").eq("shop_id", shopId).limit(1);

    if (customer.phone) q = q.ilike("phone", customer.phone);
    else if (customer.email) q = q.ilike("email", customer.email);

    const { data: found } = await q;
    if (found?.length) {
      setCustomerId(found[0].id);
      return found[0] as CustomerRowWithBusiness;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("customers")
      .insert(buildCustomerInsert(customer, shopId))
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
    // If an explicit vehicleId is set, patch update that vehicle (instead of just returning it)
    if (vehicleId) {
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
      vehicle.vin ? `vin.eq.${vehicle.vin}` : "",
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
        // ✅ patch update the matched vehicle so edits persist
        const id = (maybe[0] as VehicleRow).id;
        const patch = buildVehiclePatch(vehicle, cust.id);

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
      if (!customer.first_name && !customer.phone && !customer.email) {
        throw new Error(
          "Please enter at least a name, phone, or email for the customer.",
        );
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const cust = await ensureCustomer(shopId);
      const veh = await ensureVehicleRow(cust, shopId);

      // ✅ persist full vehicle info into draft/session
      cvDraft.bulkSet({
        customer: {
          first_name: cust.first_name ?? null,
          last_name: cust.last_name ?? null,
          phone: customer.phone ?? null,
          email: cust.email ?? null,
          address: customer.address ?? null,
          city: customer.city ?? null,
          province: customer.province ?? null,
          postal_code: customer.postal_code ?? null,
          ...(cust.business_name ? { business_name: cust.business_name } : {}),
        },
        vehicle: {
          vin: veh.vin ?? null,
          year: veh.year != null ? String(veh.year) : null,
          make: veh.make ?? null,
          model: veh.model ?? null,
          license_plate: veh.license_plate ?? null,
          mileage: (veh.mileage as string | null) ?? vehicle.mileage ?? null,
          unit_number:
            (veh.unit_number as string | null) ?? vehicle.unit_number ?? null,
          color: (veh.color as string | null) ?? vehicle.color ?? null,
          engine_hours:
            veh.engine_hours != null
              ? String(veh.engine_hours)
              : vehicle.engine_hours ?? null,

          // ✅ NEW
          engine: (veh.engine as string | null) ?? vehicle.engine ?? null,
          transmission:
            (veh.transmission as string | null) ?? vehicle.transmission ?? null,
          fuel_type:
            (veh.fuel_type as string | null) ?? vehicle.fuel_type ?? null,
          drivetrain:
            (veh.drivetrain as string | null) ?? vehicle.drivetrain ?? null,
        },
      });

      if (wo?.id) {
        if (wo.customer_id !== cust.id || wo.vehicle_id !== veh.id) {
          const waiter = (wo as WorkOrderWaiterRow).is_waiter;

          const { data: updated, error: updErr } = await supabase
            .from("work_orders")
            .update({
              customer_id: cust.id,
              vehicle_id: veh.id,
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

      const { data: created, error: rpcErr } = await supabase.rpc(
        "create_work_order_with_custom_id",
        {
          p_shop_id: shopId,
          p_customer_id: cust.id,
          p_vehicle_id: veh.id,
          // ✅ ensure string
          p_notes: strOrNull(notes) ?? "",
          p_priority: priority,
          p_is_waiter: isWaiter,
        },
      );

      if (rpcErr) {
        throw new Error(rpcErr.message || "Failed to create work order.");
      }

      const createdRow = (created as unknown as CreateWoRpcRow | null) ?? null;
      if (!createdRow?.id) {
        throw new Error("Failed to create work order (no row returned).");
      }

      setWo(createdRow as unknown as WorkOrderRow);
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
      // 1) Save intake into work_orders.notes (non-breaking, no schema change)
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

      // 2) Auto-create diagnostic line (avoid duplicates)
      const diagDesc = `Intake: ${concern}`;

      const { data: existingLines, error: lErr } = await supabase
        .from("work_order_lines")
        .select("id, description")
        .eq("work_order_id", wo.id)
        .order("created_at", { ascending: true });

      if (lErr) throw lErr;

      const already = (existingLines ?? []).some(
        (l) => (l.description ?? "") === diagDesc,
      );

      if (!already) {
        const insertLine: DB["public"]["Tables"]["work_order_lines"]["Insert"] = {
          work_order_id: wo.id,
          job_type: "diagnosis",
          status: "awaiting",
          complaint: concern,
          description: diagDesc,
          labor_time: 1.0,
        };

        const { error: insErr } = await supabase
          .from("work_order_lines")
          .insert(insertLine);

        if (insErr) throw insErr;
      }

      await fetchLines();
      toast.success("Intake saved and diagnostic line created.");
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
    setSendInvite(false);
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
              next: "/portal",
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
        min-h-screen px-4 py-6 text-foreground
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
      style={{ ["--copper" as never]: COPPER }}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className={cx(card, "px-5 py-4")}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.25em] text-neutral-400">
                Work Orders
              </div>
              <h1
                className="mt-1 text-2xl font-semibold text-white"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                Create Work Order
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                Link a customer and vehicle, add jobs and inspections, then send to
                approval and signature.
              </p>

              {wo?.custom_id && (
                <p className="mt-1 text-xs text-neutral-500">
                  Current WO:{" "}
                  <span className="font-mono text-[color:var(--copper)]">
                    {wo.custom_id}
                  </span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.back()}
              className="
                shrink-0 rounded-full border border-white/10 bg-black/50
                px-4 py-2 text-sm font-semibold text-neutral-200
                hover:bg-black/65
              "
            >
              Back to list
            </button>
          </div>
        </div>

        {/* Body */}
        <section className={cx(card, "px-4 py-5 backdrop-blur-xl sm:px-6 sm:py-6")}>
          {error && (
            <div className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {uploadSummary && (
            <div className="mb-4 rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-neutral-200">
              Uploaded {uploadSummary.uploaded} file(s)
              {uploadSummary.failed ? `, ${uploadSummary.failed} failed` : ""}.
            </div>
          )}

          {inviteNotice && (
            <div className="mb-4 rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-neutral-200">
              {inviteNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer & Vehicle */}
            <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
                  Customer &amp; Vehicle
                </h2>
                <span className="text-[11px] text-neutral-500">
                  Save first, then add lines
                </span>
              </div>

              <CustomerVehicleForm
                customer={customer}
                vehicle={vehicle}
                saving={savingCv}
                workOrderExists={!!wo?.id}
                shopId={wo?.shop_id ?? currentShopId}
                handlers={{
                  onCustomerChange,
                  // ✅ cast to keep props serializable + avoid leaking internal types
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
    rounded-full border border-white/10 bg-black/50
    px-4 py-2 text-sm font-semibold text-neutral-200
    hover:bg-black/65 disabled:opacity-60
  "
>
  {savingCv ? "Saving…" : "Save & Continue"}
</button>

                <button
                  type="button"
                  onClick={handleClearForm}
                  className="
                    rounded-full border border-red-400/25 bg-black/50
                    px-4 py-2 text-sm font-semibold text-red-200
                    hover:bg-red-500/10
                  "
                >
                  Clear form
                </button>

                <VinCaptureModal
                  userId={currentUserId ?? "anon"}
                  action="/api/vin"
                  onDecoded={(d: VinDecoded) => {
                    const y = yearToStrOrNull(d.year);

                    draft.setVehicle({
                      vin: d.vin,
                      year: y,
                      make: d.make ?? null,
                      model: d.model ?? null,
                      engine: d.engine ?? null,
                      fuel_type: d.fuelType ?? null,
                      drivetrain: d.driveType ?? null,
                      transmission: d.transmission ?? null,
                    });

                    setVehicle((prev) => ({
                      ...prev,
                      vin: d.vin || prev.vin,
                      year: y ?? prev.year,
                      make: d.make ?? prev.make,
                      model: d.model ?? prev.model,
                      engine: d.engine ?? prev.engine ?? null,
                      fuel_type: d.fuelType ?? prev.fuel_type ?? null,
                      drivetrain: d.driveType ?? prev.drivetrain ?? null,
                      transmission: d.transmission ?? prev.transmission ?? null,
                    }));

                    cvDraft.bulkSet({
                      vehicle: {
                        vin: d.vin ?? null,
                        year: y,
                        make: d.make ?? null,
                        model: d.model ?? null,
                        engine: d.engine ?? null,
                        fuel_type: d.fuelType ?? null,
                        drivetrain: d.driveType ?? null,
                        transmission: d.transmission ?? null,
                      },
                    });
                  }}
                >
                  <span
                    className="
                      cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold
                      bg-[color:var(--copper)]/10 text-[color:var(--copper)]
                      border-[color:var(--copper)]/70 hover:bg-[color:var(--copper)]/15
                    "
                  >
                    Add by VIN / Scan
                  </span>
                </VinCaptureModal>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-neutral-300">
                <input
                  id="send-invite"
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="h-4 w-4 rounded border-white/10 bg-black/50"
                  disabled={loading}
                />
                Email a customer portal sign-up link
              </label>
            </section>

            {/* Uploads */}
            <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
                  Uploads
                </h2>
                <span className="text-[11px] text-neutral-500">Optional</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                  <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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

            {/* Menu quick add */}
            {wo?.id && (
              <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
                <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--copper)]">
                    Quick add from menu
                  </h2>
                  <span className="text-[11px] text-neutral-500">Saved services</span>
                </div>
                <MenuQuickAdd workOrderId={wo.id} />
              </section>
            )}

            {/* Add line */}
            {wo?.id && (
              <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
                <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
                    Add job line
                  </h2>
                  <span className="text-[11px] text-neutral-500">Manual entry</span>
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
            <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
              <div className={cx("mb-3 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
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
                <p className="text-sm text-neutral-400">No lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/50 p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-neutral-100">
                          {ln.description || ln.complaint || "Untitled job"}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                          {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} •{" "}
                          {(ln.status ?? "awaiting").replaceAll("_", " ")}
                        </div>
                        {(ln.complaint || ln.cause || ln.correction) && (
                          <div className="mt-1 text-xs text-neutral-500">
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
                          className="
                            rounded-full border border-red-400/25 bg-black/50
                            px-3 py-2 text-sm font-semibold text-red-200
                            hover:bg-red-500/10
                          "
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Options */}
            <section className="rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.55)] sm:p-5">
              <div className={cx("mb-3 flex items-center justify-between border-b pb-3", divider)}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
                  Work order options
                </h2>
                <span className="text-[11px] text-neutral-500">Defaults</span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Sets the default for new lines you add on this work order.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Used to highlight urgent jobs in queues and dashboards.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
                    Customer waiting (waiter)
                  </label>
                  <select
                    value={isWaiter ? "waiter" : "dropoff"}
                    onChange={(e) => setIsWaiter(e.target.value === "waiter")}
                    className="input"
                    disabled={loading}
                  >
                    <option value="dropoff">Drop-off / not waiting</option>
                    <option value="waiter">Customer waiting (waiter)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    When set to waiter, the work order will show a{" "}
                    <span className="font-semibold text-neutral-300">WAITING</span>{" "}
                    status badge.
                  </p>
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                </div>
              </div>
            </section>

            {/* Footer actions */}
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
                {loading ? "Creating..." : "Approve & Sign"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/work-orders")}
                className="text-sm text-neutral-400 hover:text-white"
                disabled={loading}
              >
                Cancel
              </button>
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
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={dismissIntakeOnce}
              />
              <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-black/70 p-4 shadow-[0_0_40px_rgba(0,0,0,0.85)] backdrop-blur-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-neutral-400">
                      Intake (quick)
                    </div>
                    <h3
                      className="mt-1 text-xl font-semibold text-white"
                      style={{ fontFamily: "var(--font-blackops), system-ui" }}
                    >
                      What brought them in?
                    </h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      Saves to WO notes and creates a diagnostic line for the tech.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={dismissIntakeOnce}
                    className="rounded-full border border-white/10 bg-black/50 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-black/65"
                  >
                    Skip
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                    <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                      <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                      <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-400">
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
                      className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-black/65 disabled:opacity-60"
                    >
                      Skip for now
                    </button>

                    <button
                      type="button"
                      onClick={dismissIntakeForever}
                      disabled={intakeSaving}
                      className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-neutral-200 hover:bg-black/65 disabled:opacity-60"
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