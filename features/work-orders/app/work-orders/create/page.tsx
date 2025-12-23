// features/work-orders/app/work-orders/create/page.tsx
"use client";

/**
 * Create Work Order (Front Desk)
 * ---------------------------------------------------------------------------
 * Integrated with VIN scanner + draft store.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
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

// 🔢 shared custom-id generator
import { generateWorkOrderCustomId } from "@/features/work-orders/lib/generateCustomId";

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
   Types & helpers
============================================================================= */
type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderInsert = DB["public"]["Tables"]["work_orders"]["Insert"];
type LineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderLine = LineRow;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

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

  // Session-shaped state
  const defaultCustomer: SessionCustomer = {
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    province: null,
    postal_code: null,
  };
  const defaultVehicle: SessionVehicle = {
    year: null,
    make: null,
    model: null,
    vin: null,
    license_plate: null,
    mileage: null,
    color: null,
    unit_number: null,
    engine_hours: null,
  };

  const [customer, setCustomer] = useTabState<SessionCustomer>(
    "__cv_customer",
    defaultCustomer,
  );
  const [vehicle, setVehicle] = useTabState<SessionVehicle>(
    "__cv_vehicle",
    defaultVehicle,
  );

  // CV draft (session persisted)
  const cvDraft = useCustomerVehicleDraft();

  // Hydrate from CV draft on first load (only fill empty fields)
  useEffect(() => {
    const d = cvDraft;
    if (!d) return;

    const hasDraftCust = Object.values(d.customer || {}).some(Boolean);
    const hasDraftVeh = Object.values(d.vehicle || {}).some(Boolean);

    if (hasDraftCust) {
      setCustomer((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(d.customer).map(([k, v]) => [
            k as keyof SessionCustomer,
            (prev as any)[k] ?? v ?? null,
          ]),
        ),
      }));
    }
    if (hasDraftVeh) {
      setVehicle((prev) => ({
        ...prev,
        vin: d.vehicle.vin ?? prev.vin,
        year: d.vehicle.year ?? prev.year,
        make: d.vehicle.make ?? prev.make,
        model: d.vehicle.model ?? prev.model,
        license_plate:
          (d.vehicle as any).license_plate ??
          (d.vehicle as any).plate ??
          prev.license_plate,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once

  const onCustomerChange = (
    field: keyof SessionCustomer | "business_name",
    value: string | null,
  ) => {
    if (field === "business_name") {
      setCustomer((c) => ({ ...(c as any), business_name: value } as any));
      cvDraft.setCustomerField(field as any, value);
    } else {
      setCustomer((c) => ({ ...c, [field]: value }));
      cvDraft.setCustomerField(field as any, value);
    }
  };

  const onVehicleChange = (field: keyof SessionVehicle, value: string | null) => {
    setVehicle((v) => ({ ...v, [field]: value }));
    cvDraft.setVehicleField(field as any, value);
  };

  // Captured ids
  const [customerId, setCustomerId] = useTabState<string | null>("customerId", null);
  const [vehicleId, setVehicleId] = useTabState<string | null>("vehicleId", null);

  // Work order + lines
  const [wo, setWo] = useTabState<WorkOrderRow | null>("__create_wo", null);
  const [lines, setLines] = useTabState<LineRow[]>("__create_lines", []);

  // ✅ inspection modal state
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // ✅ AI suggest modal state
  const [aiSuggestOpen, setAiSuggestOpen] = useState(false);

  // Defaults / notes
  const [type, setType] = useTabState<WOType>("type", "maintenance");
  const [notes, setNotes] = useTabState("notes", "");
  const [priority, setPriority] = useTabState<number>("priority", 3);
  const [isWaiter, setIsWaiter] = useTabState<boolean>("is_waiter", false);

  // Uploads
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // UI state
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError] = useTabState("error", "");
  const [inviteNotice, setInviteNotice] = useTabState<string>("inviteNotice", "");
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
      const byUserId = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (byUserId.data?.shop_id) {
        shop = byUserId.data.shop_id;
      } else {
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
  const draft = useWorkOrderDraft();
  useEffect(() => {
    const hasVeh = Object.values(draft.vehicle || {}).some((v) => v);
    const hasCust = Object.values(draft.customer || {}).some((v) => v);

    if (hasVeh) {
      setVehicle((prev) => ({
        ...prev,
        vin: draft.vehicle.vin ?? prev.vin,
        year: draft.vehicle.year ?? prev.year,
        make: draft.vehicle.make ?? prev.make,
        model: draft.vehicle.model ?? prev.model,
        license_plate:
          (draft.vehicle as any).license_plate ??
          (draft.vehicle as any).plate ??
          prev.license_plate,
      }));
    }
    if (hasCust) {
      setCustomer((prev) => ({
        ...prev,
        first_name: draft.customer.first_name ?? prev.first_name,
        last_name: draft.customer.last_name ?? prev.last_name,
        phone: draft.customer.phone ?? prev.phone,
        email: draft.customer.email ?? prev.email,
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
  }, []);

  // keep waiter state in sync with an existing WO (editing case)
  useEffect(() => {
    if (!wo) return;
    const flag = (wo as any).is_waiter ?? false;
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
    const { data: profileById, error: profErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) throw profErr;
    if (profileById?.shop_id) return profileById.shop_id;

    const { data: ownedShop, error: shopErr } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopErr) throw shopErr;
    if (!ownedShop?.id) return null;

    const { error: updErr } = await supabase
      .from("profiles")
      .update({ shop_id: ownedShop.id })
      .eq("id", userId);

    if (updErr) throw updErr;

    return ownedShop.id;
  }

  const buildCustomerInsert = (c: SessionCustomer, shopId: string | null) => ({
    business_name: strOrNull((c as any).business_name ?? null),
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

  const buildVehicleInsert = (v: SessionVehicle, customerId: string, shopId: string | null) => ({
    customer_id: customerId,
    vin: strOrNull(v.vin),
    year: numOrNull(v.year),
    make: strOrNull(v.make),
    model: strOrNull(v.model),
    license_plate: strOrNull(v.license_plate),
    mileage: strOrNull(v.mileage),
    unit_number: strOrNull(v.unit_number),
    color: strOrNull(v.color),
    engine_hours: numOrNull(v.engine_hours),
    shop_id: shopId,
  });

  const hydrateCustomerFromRow = (row: any): SessionCustomer => {
    const base: any = {
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      phone: getStrField(row, "phone"),
      email: row.email ?? null,
      address: getStrField(row, "address"),
      city: getStrField(row, "city"),
      province: getStrField(row, "province"),
      postal_code: getStrField(row, "postal_code"),
    };
    if (row.business_name) base.business_name = row.business_name;
    return base as SessionCustomer;
  };

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
            setCustomer(hydrateCustomerFromRow(data));
            setCustomerId(data.id);
          }
        }
        if (prefillVehicleId) {
          const { data } = await supabase
            .from("vehicles")
            .select(
              "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, customer_id",
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
              engine_hours: data.engine_hours != null ? String(data.engine_hours) : null,
            });
            setVehicleId(data.id);

            if (!customerId && data.customer_id) {
              const { data: cust } = await supabase
                .from("customers")
                .select("*")
                .eq("id", data.customer_id)
                .maybeSingle();
              if (cust) {
                setCustomer(hydrateCustomerFromRow(cust));
                setCustomerId(cust.id);
              }
            }
          }
        }
      } catch {
        // noop
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
  ]);

  // Ensure / create: Customer & Vehicle
  async function ensureCustomer(shopId: string): Promise<CustomerRow> {
    if (customerId) {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();
      if (data) return data;
    }

    let q = supabase.from("customers").select("*").eq("shop_id", shopId).limit(1);
    if (customer.phone) q = q.ilike("phone", customer.phone);
    else if (customer.email) q = q.ilike("email", customer.email);
    const { data: found } = await q;
    if (found?.length) {
      setCustomerId(found[0].id);
      return found[0];
    }

    const { data: inserted, error: insErr } = await supabase
      .from("customers")
      .insert(buildCustomerInsert(customer, shopId))
      .select("*")
      .single();
    if (insErr || !inserted) {
      throw new Error(insErr?.message ?? "Failed to create customer");
    }
    setCustomerId(inserted.id);
    return inserted;
  }

  async function ensureVehicleRow(cust: CustomerRow, shopId: string | null): Promise<VehicleRow> {
    if (vehicleId) {
      const { data } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .single();
      if (data) return data;
    }

    const orParts = [
      vehicle.vin ? `vin.eq.${vehicle.vin}` : "",
      vehicle.license_plate ? `license_plate.eq.${vehicle.license_plate}` : "",
    ].filter(Boolean);

    if (orParts.length) {
      const { data: maybe } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", cust.id)
        .or(orParts.join(","));
      if (maybe?.length) {
        setVehicleId(maybe[0].id);
        return maybe[0] as VehicleRow;
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from("vehicles")
      .insert(buildVehicleInsert(vehicle, cust.id, shopId))
      .select("*")
      .single();
    if (insErr || !inserted) {
      throw new Error(insErr?.message ?? "Failed to create vehicle");
    }
    setVehicleId(inserted.id);
    return inserted as VehicleRow;
  }

  // Save & Continue (creates/links WO right away)
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

  const handleSaveCustomerVehicle = useCallback(async () => {
    if (savingCv) return;
    setSavingCv(true);
    setError("");

    try {
      if (!customer.first_name && !customer.phone && !customer.email) {
        throw new Error("Please enter at least a name, phone, or email for the customer.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");
      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const cust = await ensureCustomer(shopId);
      const veh = await ensureVehicleRow(cust, shopId);

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
          ...(cust as any).business_name ? { business_name: (cust as any).business_name } : {},
        } as any,
        vehicle: {
          vin: veh.vin ?? null,
          year: veh.year != null ? String(veh.year) : null,
          make: veh.make ?? null,
          model: veh.model ?? null,
          license_plate: veh.license_plate ?? null,
          mileage: (veh.mileage as string | null) ?? vehicle.mileage ?? null,
          unit_number: vehicle.unit_number ?? null,
          color: veh.color ?? null,
          engine_hours: vehicle.engine_hours ?? null,
        },
      });

      if (wo?.id) {
        if (wo.customer_id !== cust.id || wo.vehicle_id !== veh.id) {
          const { data: updated, error: updErr } = await supabase
            .from("work_orders")
            .update({
              customer_id: cust.id,
              vehicle_id: veh.id,
              ...(typeof (wo as any).is_waiter !== "undefined"
                ? { is_waiter: (wo as any).is_waiter }
                : {}),
            } as any)
            .eq("id", wo.id)
            .select("*")
            .single();
          if (updErr) throw updErr;
          setWo(updated);
        }
        await fetchLines();
        return;
      }

      const customId = await generateWorkOrderCustomId(supabase, cust.id);
      const newId = uuidv4();

      const insertPayload: WorkOrderInsert = {
        id: newId,
        custom_id: customId ?? null,
        vehicle_id: veh.id,
        customer_id: cust.id,
        notes: strOrNull(notes),
        user_id: user.id,
        shop_id: shopId,
        status: "awaiting_approval",
        priority: priority,
      };

      (insertPayload as any).is_waiter = isWaiter;

      const { data: inserted, error: insertWOError } = await supabase
        .from("work_orders")
        .insert(insertPayload as any)
        .select("*")
        .single();
      if (insertWOError || !inserted) {
        throw new Error(insertWOError?.message || "Failed to create work order.");
      }

      setWo(inserted);
      await fetchLines();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save customer/vehicle.";
      setError(msg);
    } finally {
      setSavingCv(false);
    }
  }, [
    savingCv,
    supabase,
    wo?.id,
    notes,
    customer,
    fetchLines,
    cvDraft,
    vehicle,
    priority,
    isWaiter,
    wo,
  ]);

  // Clear form
  const handleClearForm = useCallback(() => {
    setCustomer(defaultCustomer as any);
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
    setCustomer,
    setVehicle,
    setCustomerId,
    setVehicleId,
    setPrefillCustomerId,
    setPrefillVehicleId,
    setPhotoFiles,
    setDocFiles,
    setUploadSummary,
    setInviteNotice,
    setSendInvite,
    setIsWaiter,
    cvDraft,
  ]);

  // Upload helpers
  async function uploadVehicleFiles(vId: string): Promise<UploadSummary> {
    let uploaded = 0,
      failed = 0;
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
      const key = `veh_${vId}/${Date.now()}_${f.name}`;
      const up = await supabase.storage.from(bucket).upload(key, f, { upsert: false });
      if (up.error) {
        failed += 1;
        return;
      }
      const { error: rowErr } = await supabase.from("vehicle_media").insert({
        vehicle_id: vId,
        type: mediaType,
        storage_path: key,
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
        const q = supabase
          .from("work_order_lines")
          .delete()
          .eq("id", lineId)
          .eq("work_order_id", wo.id);

        if (wo.shop_id) (q as any).eq("shop_id", wo.shop_id);

        const { data: deleted, error } = await (q as any).select("id").maybeSingle();

        if (error) {
          alert(error.message || "Delete failed");
          return;
        }
        if (!deleted) {
          alert("Could not delete the line (no matching row). Check permissions/policies.");
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

  // 🔍 open inspection
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

      const sp = new URLSearchParams();

      if (wo?.id) sp.set("workOrderId", wo.id);
      sp.set("workOrderLineId", ln.id);
      sp.set("templateId", templateId);
      sp.set("embed", "1");
      sp.set("view", "mobile");

      if (ln.description) sp.set("seed", String(ln.description));

      const url = `/inspections/run?${sp.toString()}`;

      setInspectionSrc(url);
      setInspectionOpen(true);
      toast.success("Inspection opened");
    },
    [wo?.id],
  );

  // Submit → Review & Sign
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setInviteNotice("");
    setUploadSummary(null);

    try {
      await handleSaveCustomerVehicle();

      const woId = wo?.id;
      if (!woId) throw new Error("Could not create work order.");

      const { data: latest, error: latestErr } = await supabase
        .from("work_orders")
        .select("id, custom_id, customer_id, vehicle_id, is_waiter")
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
          const origin =
            typeof window !== "undefined"
              ? window.location.origin
              : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
          const portalUrl = `${
            origin || "https://profixiq.com"
          }/portal/auth/sign-up?email=${encodeURIComponent(customer.email)}`;
          const { error: fnErr } = await supabase.functions.invoke("send-portal-invite", {
            body: {
              email: customer.email,
              customer_id: latest.customer_id,
              portal_url: portalUrl,
            },
          });
          if (fnErr)
            setInviteNotice("Work order created. Failed to send invite email (logged).");
          else setInviteNotice("Work order created. Invite email queued to the customer.");
        } catch {
          setInviteNotice("Work order created. Failed to send invite email (caught).");
        }
      }

      router.push(`/work-orders/${latest.id}/approve`);
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "Failed to create work order.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Realtime line refresh
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

  // Vehicle label for AI modal context
  const vehicleLabel =
    vehicle.year || vehicle.make || vehicle.model
      ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
      : vehicle.license_plate
        ? `Plate ${vehicle.license_plate}`
        : null;

  /* UI */
  return (
    <div className="relative min-h-[calc(100vh-4rem)] px-4 py-6 text-white">
      {/* radial wash (switch orange -> copper vars) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(212,118,49,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header card */}
        <section className="mb-2 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 px-5 py-4 shadow-[0_22px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div>
            <h1
              className="text-2xl font-semibold text-white"
              style={{ fontFamily: "var(--font-blackops), system-ui" }}
            >
              Create Work Order
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Link a customer and vehicle, add jobs and inspections, then send
              to approval and signature.
            </p>
            {wo?.custom_id && (
              <p className="mt-1 text-xs text-white/45">
                Current WO:{" "}
                <span className="font-mono text-[var(--accent-copper-light)]">
                  {wo.custom_id}
                </span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-white/12 bg-black/45 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/75 shadow-[0_10px_24px_rgba(0,0,0,0.70)] hover:bg-white/5"
          >
            Back to list
          </button>
        </section>

        {/* Main card with form */}
        <section className="rounded-2xl border border-white/10 bg-black/35 px-4 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:px-6 sm:py-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/45 bg-red-950/45 px-4 py-2 text-sm text-red-100">
              {error}
            </div>
          )}

          {uploadSummary && (
            <div className="mb-4 rounded-lg border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/80">
              Uploaded {uploadSummary.uploaded} file(s)
              {uploadSummary.failed ? `, ${uploadSummary.failed} failed` : ""}.
            </div>
          )}

          {inviteNotice && (
            <div className="mb-4 rounded-lg border border-white/10 bg-black/35 px-4 py-2 text-sm text-white/80">
              {inviteNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer & Vehicle */}
            <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                Customer &amp; Vehicle
              </h2>

              <CustomerVehicleForm
                customer={customer}
                vehicle={vehicle}
                saving={savingCv}
                workOrderExists={!!wo?.id}
                shopId={wo?.shop_id ?? currentShopId}
                handlers={{
                  onCustomerChange,
                  onVehicleChange,
                  onCustomerSelected: (id: string) => setCustomerId(id),
                  onVehicleSelected: (id: string) => setVehicleId(id),
                }}
              />

              {/* Local buttons row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCustomerVehicle}
                  disabled={savingCv || loading}
                  className="rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 hover:bg-white/5 disabled:opacity-60 sm:text-sm"
                >
                  {savingCv ? "Saving…" : "Save & Continue"}
                </button>

                <button
                  type="button"
                  onClick={handleClearForm}
                  className="rounded-full border border-red-500/45 bg-black/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 hover:bg-red-950/35 sm:text-sm"
                >
                  Clear form
                </button>

                <VinCaptureModal
                  userId={currentUserId ?? "anon"}
                  action="/api/vin"
                  onDecoded={(d) => {
                    draft.setVehicle({
                      vin: d.vin,
                      year: d.year ?? null,
                      make: d.make ?? null,
                      model: d.model ?? null,
                      engine: d.engine ?? null,
                      fuel_type: d.fuelType ?? null,
                      drivetrain: d.driveType ?? null,
                      transmission: d.transmission ?? null,
                    } as any);

                    setVehicle((prev) =>
                      ({
                        ...prev,
                        vin: d.vin || prev.vin,
                        year: d.year ?? prev.year,
                        make: d.make ?? prev.make,
                        model: d.model ?? prev.model,
                        engine: d.engine ?? (prev as any).engine ?? null,
                        fuel_type: d.fuelType ?? (prev as any).fuel_type ?? null,
                        drivetrain: d.driveType ?? (prev as any).drivetrain ?? null,
                        transmission: d.transmission ?? (prev as any).transmission ?? null,
                      } as any),
                    );

                    cvDraft.bulkSet({
                      vehicle: {
                        vin: d.vin ?? null,
                        year: d.year ?? null,
                        make: d.make ?? null,
                        model: d.model ?? null,
                        engine: d.engine ?? null,
                        fuel_type: d.fuelType ?? null,
                        drivetrain: d.driveType ?? null,
                        transmission: d.transmission ?? null,
                      } as any,
                    });
                  }}
                >
                  <span className="cursor-pointer rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-xs text-[var(--accent-copper-light)] hover:bg-[color:var(--accent-copper-900,rgba(120,63,28,0.20))] sm:text-sm">
                    Add by VIN / Scan
                  </span>
                </VinCaptureModal>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
                <input
                  id="send-invite"
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/50"
                  disabled={loading}
                />
                Email a customer portal sign-up link
              </label>
            </section>

            {/* Uploads */}
            <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-white/85">Uploads</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">
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
                  <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">
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

            {/* Quick add from menu */}
            {wo?.id && (
              <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:p-5">
                <h2 className="mb-3 text-sm font-semibold text-[var(--accent-copper-light)]">
                  Quick add from menu
                </h2>
                <MenuQuickAdd workOrderId={wo.id} />
              </section>
            )}

            {/* Manual add line */}
            {wo?.id && (
              <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:p-5">
                <h2 className="mb-3 text-sm font-semibold text-white/85">
                  Add Job Line
                </h2>
                <NewWorkOrderLineForm
                  workOrderId={wo.id}
                  vehicleId={vehicleId}
                  defaultJobType={type}
                  shopId={wo.shop_id ?? null}
                  onCreated={fetchLines}
                />
              </section>
            )}

            {/* Current Lines */}
            <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:p-5">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold text-white/85">Current lines</h2>
                {wo?.id && (
                  <button
                    type="button"
                    onClick={() => setAiSuggestOpen(true)}
                    className="inline-flex items-center rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-950/30 sm:text-sm"
                  >
                    AI: Suggest jobs
                  </button>
                )}
              </div>

              {!wo?.id || lines.length === 0 ? (
                <p className="text-sm text-white/45">No lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((ln) => (
                    <div
                      key={ln.id}
                      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/35 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.60)] sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white/90">
                          {ln.description || ln.complaint || "Untitled job"}
                        </div>
                        <div className="text-xs text-white/50">
                          {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                          {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} •{" "}
                          {(ln.status ?? "awaiting").replaceAll("_", " ")}
                        </div>
                        {(ln.complaint || ln.cause || ln.correction) && (
                          <div className="mt-1 text-xs text-white/40">
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
                            onClick={() => openInspectionForLine(ln)}
                            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-[var(--accent-copper-light)] hover:bg-[color:var(--accent-copper-900,rgba(120,63,28,0.20))]"
                          >
                            Open inspection
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(ln.id)}
                          className="rounded-md border border-red-500/45 bg-black/40 px-2 py-1 text-xs text-red-200 hover:bg-red-950/35"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Work Order defaults / options */}
            <section className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.70)] backdrop-blur-xl sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-white/85">
                Work order options
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">
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
                  <p className="mt-1 text-[11px] text-white/35">
                    Sets the default for new lines you add on this work order.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">
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
                  <p className="mt-1 text-[11px] text-white/35">
                    Used to highlight urgent jobs in queues and dashboards.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">
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
                  <p className="mt-1 text-[11px] text-white/35">
                    When set to waiter, the work order will show a{" "}
                    <span className="font-semibold">WAITING</span> status badge.
                  </p>
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs uppercase tracking-wide text-white/45">
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

            {/* Submit */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_0_24px_rgba(212,118,49,0.55)] hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Creating..." : "Approve & Sign"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/work-orders")}
                className="text-sm text-white/55 hover:text-white"
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>

          {/* 👇 inspection modal lives here */}
          {inspectionOpen && inspectionSrc && (
            <InspectionModal
              open={inspectionOpen}
              src={inspectionSrc}
              title="Inspection"
              onClose={() => setInspectionOpen(false)}
            />
          )}

          {/* 👇 AI Suggest modal lives here */}
          {wo?.id && (
            <AiSuggestModal
              open={aiSuggestOpen}
              onClose={() => setAiSuggestOpen(false)}
              workOrderId={wo.id}
              vehicleId={vehicleId}
              vehicleLabel={vehicleLabel}
              onAdded={() => {
                void fetchLines();
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}