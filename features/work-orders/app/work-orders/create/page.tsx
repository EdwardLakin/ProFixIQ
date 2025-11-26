"use client";

/**
 * Create Work Order (Front Desk)
 * ---------------------------------------------------------------------------
 * Integrated with VIN scanner + draft store.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";

import VinCaptureModal from "app/vehicle/VinCaptureModal";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import { useCustomerVehicleDraft } from "app/work-orders/state/useCustomerVehicleDraft";

// UI
import CustomerVehicleForm from "@/features/inspections/components/inspection/CustomerVehicleForm";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";


// Session types
import type {
  SessionCustomer,
  SessionVehicle,
} from "@/features/inspections/lib/inspection/types";

// 👇 new: inspection modal, client-only
const InspectionModal = dynamic(
  () => import("@/features/inspections/components/InspectionModal"),
  { ssr: false }
);

/* =============================================================================
   Types & helpers
============================================================================= */
type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderInsert = DB["public"]["Tables"]["work_orders"]["Insert"];
type LineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

const getStrField = (obj: unknown, key: string): string | null => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "number") return String(v);
    if (v == null) return null;
  }
  return null;
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

const AUTO_CREATE_ON_MOUNT = true;

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
    null
  );
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>(
    "prefillCustomerId",
    null
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
    defaultCustomer
  );
  const [vehicle, setVehicle] = useTabState<SessionVehicle>(
    "__cv_vehicle",
    defaultVehicle
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
          ])
        ),
      }));
    }
    if (hasDraftVeh) {
      setVehicle((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(d.vehicle).map(([k, v]) => [
            k as keyof SessionVehicle,
            (prev as any)[k] ?? v ?? null,
          ])
        ),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once

  const onCustomerChange = (
    field: keyof SessionCustomer | "business_name",
    value: string | null
  ) => {
    if (field === "business_name") {
      // store extra field alongside SessionCustomer shape
      setCustomer((c) => ({ ...(c as any), business_name: value } as any));
      cvDraft.setCustomerField(field as any, value);
    } else {
      setCustomer((c) => ({ ...c, [field]: value }));
      cvDraft.setCustomerField(field as any, value);
    }
  };

  const onVehicleChange = (
    field: keyof SessionVehicle,
    value: string | null
  ) => {
    setVehicle((v) => ({ ...v, [field]: value }));
    cvDraft.setVehicleField(field as any, value);
  };

  // Captured ids
  const [customerId, setCustomerId] = useTabState<string | null>(
    "customerId",
    null
  );
  const [vehicleId, setVehicleId] = useTabState<string | null>(
    "vehicleId",
    null
  );

  // Work order + lines
  const [wo, setWo] = useTabState<WorkOrderRow | null>("__create_wo", null);
  const [lines, setLines] = useTabState<LineRow[]>("__create_lines", []);

  // ✅ inspection modal state
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // Defaults / notes
  const [type, setType] = useTabState<WOType>("type", "maintenance");
  const [notes, setNotes] = useTabState("notes", "");
  // 👇 work order priority (1 urgent → 4 low). default 3 = normal
  const [priority, setPriority] = useTabState<number>("priority", 3);

  // Uploads
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(
    null
  );

  // UI state
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError] = useTabState("error", "");
  const [inviteNotice, setInviteNotice] =
    useTabState<string>("inviteNotice", "");
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", false);

  // Current user (email for custom_id prefix fallback)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
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

  const isMounted = useRef(false);

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
        license_plate: draft.vehicle.plate ?? prev.license_plate,
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

  useEffect((): void => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserEmail(user?.email ?? null);
      setCurrentUserId(user?.id ?? null);
    })();
  }, [supabase]);

  function getInitials(
    first?: string | null,
    last?: string | null,
    fallback?: string | null
  ) {
    const f = (first ?? "").trim();
    const l = (last ?? "").trim();
    if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "WO";
    const fb = (fallback ?? "").trim();
    if (fb.includes("@"))
      return fb.split("@")[0].slice(0, 2).toUpperCase() || "WO";
    return fb.slice(0, 2).toUpperCase() || "WO";
  }

  async function generateCustomId(prefix: string): Promise<string> {
    const p = prefix.replace(/[^A-Z]/g, "").slice(0, 3) || "WO";
    const { data } = await supabase
      .from("work_orders")
      .select("custom_id")
      .ilike("custom_id", `${p}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    let max = 0;
    (data ?? []).forEach((r) => {
      const cid = r.custom_id ?? "";
      const m = cid.match(/^([A-Z]+)(\d{1,})$/i);
      if (m && m[1].toUpperCase() === p) {
        const n = parseInt(m[2], 10);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
    });
    const next = (max + 1).toString().padStart(4, "0");
    return `${p}${next}`;
  }

  async function getOrLinkShopId(userId: string): Promise<string | null> {
    // 1) try to read the profile we actually have (id = auth user id)
    const { data: profileById, error: profErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) throw profErr;
    if (profileById?.shop_id) {
      return profileById.shop_id;
    }

    // 2) no shop on profile → see if this user owns a shop
    const { data: ownedShop, error: shopErr } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopErr) throw shopErr;
    if (!ownedShop?.id) {
      // nothing to link
      return null;
    }

    // 3) write it back to profile so future calls are fast
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

  const buildVehicleInsert = (
    v: SessionVehicle,
    customerId: string,
    shopId: string | null
  ) => ({
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

  // helper to hydrate customer state from DB row (including business_name when present)
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
    if (row.business_name) {
      base.business_name = row.business_name;
    }
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
              "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, customer_id"
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
    if (insErr || !inserted)
      throw new Error(insErr?.message ?? "Failed to create customer");
    setCustomerId(inserted.id);
    return inserted;
  }

  async function ensureVehicleRow(
    cust: CustomerRow,
    shopId: string | null
  ): Promise<VehicleRow> {
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
    if (insErr || !inserted)
      throw new Error(insErr?.message ?? "Failed to create vehicle");
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
        throw new Error(
          "Please enter at least a name, phone, or email for the customer."
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
          // business_name is optional, lives in draft as any if supported
          ...(cust as any).business_name
            ? { business_name: (cust as any).business_name }
            : {},
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
            .update({ customer_id: cust.id, vehicle_id: veh.id })
            .eq("id", wo.id)
            .select("*")
            .single();
          if (updErr) throw updErr;
          setWo(updated);
        }
        await fetchLines();
        return;
      }

      const initials = getInitials(
        cust.first_name ?? customer.first_name,
        cust.last_name ?? customer.last_name,
        user.email ?? currentUserEmail
      );
      const customId = await generateCustomId(initials);
      const newId = uuidv4();

      const insertPayload: WorkOrderInsert = {
        id: newId,
        custom_id: customId,
        vehicle_id: veh.id,
        customer_id: cust.id,
        notes: strOrNull(notes),
        user_id: user.id,
        shop_id: shopId,
        status: "awaiting_approval",
        priority: priority,
      };

      const { data: inserted, error: insertWOError } = await supabase
        .from("work_orders")
        .insert(insertPayload)
        .select("*")
        .single();
      if (insertWOError || !inserted)
        throw new Error(insertWOError?.message || "Failed to create work order.");

      setWo(inserted);
      await fetchLines();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Failed to save customer/vehicle.";
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
    currentUserEmail,
    fetchLines,
    cvDraft,
    vehicle,
    priority,
  ]);

  // Clear form
  const handleClearForm = useCallback(() => {
    setCustomer(defaultCustomer as any); // clears known fields; extra ones like business_name drop to undefined
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
      mediaType: "photo" | "document"
    ) => {
      const key = `veh_${vId}/${Date.now()}_${f.name}`;
      const up = await supabase.storage.from(bucket).upload(key, f, {
        upsert: false,
      });
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

  // Delete line
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

        const { data: deleted, error } = await (q as any)
          .select("id")
          .maybeSingle();

        if (error) {
          alert(error.message || "Delete failed");
          return;
        }
        if (!deleted) {
          alert(
            "Could not delete the line (no matching row). Check permissions/policies."
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
    [supabase, wo?.id, wo?.shop_id, fetchLines, setLines]
  );

  // ✅ open inspection for a given line
  const openInspectionForLine = useCallback(
    async (line: LineRow) => {
      if (!wo?.id || !line?.id) return;

      // simple template picker
      const desc = (line.description || "").toLowerCase();
      const isAir = /\bair\b|cvip|push\s*rod|air\s*brake/.test(desc);
      let templateSlug = isAir ? "maintenance50-air" : "maintenance50";

      try {
        const res = await fetch("/api/inspections/session/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: wo.id,
            workOrderLineId: line.id,
            vehicleId: vehicleId,
            customerId: customerId,
            template: templateSlug,
          }),
        });

        const j = (await res.json().catch(() => null)) as
          | { sessionId?: string; error?: string }
          | null;

        if (!res.ok || !j?.sessionId) {
          throw new Error(j?.error || "Failed to create inspection session");
        }

        const sp = new URLSearchParams();
        sp.set("workOrderId", wo.id);
        sp.set("workOrderLineId", line.id);
        sp.set("inspectionId", j.sessionId);
        sp.set("template", templateSlug);
        sp.set("embed", "1");

        const url = `/inspection/${templateSlug}?${sp.toString()}`;
        setInspectionSrc(url);
        setInspectionOpen(true);
      } catch (err: any) {
        alert(err?.message || "Unable to open inspection");
      }
    },
    [wo?.id, vehicleId, customerId]
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
        .select("id, custom_id, customer_id, vehicle_id")
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
          }/portal/signup?email=${encodeURIComponent(customer.email)}`;
          const { error: fnErr } = await supabase.functions.invoke(
            "send-portal-invite",
            {
              body: {
                email: customer.email,
                customer_id: latest.customer_id,
                portal_url: portalUrl,
              },
            }
          );
          if (fnErr)
            setInviteNotice(
              "Work order created. Failed to send invite email (logged)."
            );
          else
            setInviteNotice(
              "Work order created. Invite email queued to the customer."
            );
        } catch {
          setInviteNotice(
            "Work order created. Failed to send invite email (caught)."
          );
        }
      }

      router.push(`/work-orders/${latest.id}/approve`);
    } catch (ex) {
      const message =
        ex instanceof Error ? ex.message : "Failed to create work order.";
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
        () => fetchLines()
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

  // Auto-create WO on mount
  useEffect(() => {
    if (!AUTO_CREATE_ON_MOUNT) return;
    if (isMounted.current) return;
    isMounted.current = true;

    if (wo?.id) return;
    setSourceFlags((s) => ({ ...s, autoWO: true }));

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) return;

      // Ensure placeholder customer
      let placeholderCustomer: CustomerRow | null = null;
      try {
        const { data } = await supabase
          .from("customers")
          .select("*")
          .eq("shop_id", shopId)
          .ilike("first_name", "Walk-in")
          .ilike("last_name", "Customer")
          .limit(1);
        if (data?.length) placeholderCustomer = data[0] as CustomerRow;
      } catch {
        /* noop */
      }

      if (!placeholderCustomer) {
        const { data } = await supabase
          .from("customers")
          .insert({ first_name: "Walk-in", last_name: "Customer", shop_id: shopId })
          .select("*")
          .single();
        placeholderCustomer = (data as CustomerRow) ?? null;
      }
      if (!placeholderCustomer) {
        setError("Could not ensure a placeholder customer for auto-create.");
        return;
      }

      // Ensure placeholder vehicle
      const { data: maybeVeh } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", placeholderCustomer.id)
        .eq("shop_id", shopId)
        .ilike("model", "Unassigned")
        .limit(1);
      let placeholderVehicle: VehicleRow | null = maybeVeh?.length
        ? (maybeVeh[0] as VehicleRow)
        : null;

      if (!placeholderVehicle) {
        const { data } = await supabase
          .from("vehicles")
          .insert({
            customer_id: placeholderCustomer.id,
            shop_id: shopId,
            make: "—",
            model: "Unassigned",
            mileage: null,
            unit_number: null,
            color: null,
            engine_hours: null,
          })
          .select("*")
          .single();
        placeholderVehicle = (data as VehicleRow) ?? null;
      }
      if (!placeholderVehicle) {
        setError("Could not ensure a placeholder vehicle for auto-create.");
        return;
      }

      const initials = getInitials(
        placeholderCustomer.first_name ?? customer.first_name,
        placeholderCustomer.last_name ?? customer.last_name,
        user.email ?? currentUserEmail
      );
      const customId = await generateCustomId(initials);

      const newId = uuidv4();
      const { data: inserted, error } = await supabase
        .from("work_orders")
        .insert({
          id: newId,
          custom_id: customId,
          user_id: user.id,
          shop_id: shopId,
          customer_id: placeholderCustomer.id,
          vehicle_id: placeholderVehicle.id,
          status: "awaiting_approval",
          priority: 3,
        })
        .select("*")
        .single();

      if (!error && inserted) {
        setWo(inserted);
        await fetchLines();
      } else if (error) {
        setError(error.message ?? "Failed to auto-create work order.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    supabase,
    wo?.id,
    setWo,
    fetchLines,
    setError,
    currentUserEmail,
    customer.first_name,
    customer.last_name,
  ]);

  /* UI */
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-white">
      {/* header row */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">
            Create Work Order
          </h1>
          <p className="text-sm text-neutral-400">
            Capture customer &amp; vehicle, add jobs, then approve.
          </p>
          {wo?.custom_id && (
            <div className="mt-1 text-xs text-neutral-500">
              Current WO:&nbsp;
              <span className="font-mono text-orange-300">
                {wo.custom_id}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/work-orders")}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Back to list
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {uploadSummary && (
        <div className="mb-4 rounded border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200">
          Uploaded {uploadSummary.uploaded} file(s)
          {uploadSummary.failed ? `, ${uploadSummary.failed} failed` : ""}.
        </div>
      )}
      {inviteNotice && (
        <div className="mb-4 rounded border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200">
          {inviteNotice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer & Vehicle */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
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
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs sm:text-sm hover:border-orange-500 disabled:opacity-60"
            >
              {savingCv ? "Saving…" : "Save & Continue"}
            </button>

            <button
              type="button"
              onClick={handleClearForm}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs sm:text-sm hover:border-red-500"
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
                });
                setVehicle((prev) => ({
                  ...prev,
                  vin: d.vin || prev.vin,
                  year: d.year ?? prev.year,
                  make: d.make ?? prev.make,
                  model: d.model ?? prev.model,
                }));
                cvDraft.bulkSet({
                  vehicle: {
                    vin: d.vin ?? null,
                    year: d.year ?? null,
                    make: d.make ?? null,
                    model: d.model ?? null,
                  },
                });
              }}
            >
              <span className="cursor-pointer rounded border border-orange-500/80 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/10 sm:text-sm">
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
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-900"
              disabled={loading}
            />
            Email a customer portal sign-up link
          </label>
        </section>

        {/* Uploads */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Uploads</h2>
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

        {/* Quick add from menu */}
        {wo?.id && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-orange-300">
              Quick add from menu
            </h2>
            <MenuQuickAdd workOrderId={wo.id} />
          </section>
        )}

        {/* Manual add line */}
        {wo?.id && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">
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
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Current Lines
          </h2>
          {!wo?.id || lines.length === 0 ? (
            <p className="text-sm text-neutral-400">No lines yet.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((ln) => (
                <div
                  key={ln.id}
                  className="flex flex-col gap-3 rounded border border-neutral-800 bg-neutral-950 p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {ln.description || ln.complaint || "Untitled job"}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                      {typeof ln.labor_time === "number"
                        ? `${ln.labor_time}h`
                        : "—"}{" "}
                      • {(ln.status ?? "awaiting").replaceAll("_", " ")}
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
                        onClick={() => openInspectionForLine(ln)}
                        className="rounded border border-orange-500 px-2 py-1 text-xs text-orange-200 hover:bg-orange-500/10"
                      >
                        Open Inspection
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteLine(ln.id)}
                      className="rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Work Order defaults */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Work Order options
          </h2>
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

        {/* Submit */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
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

      {/* 👇 inspection modal lives here */}
      {inspectionOpen && inspectionSrc && (
        <InspectionModal
          open={inspectionOpen}
          src={inspectionSrc}
          title="Inspection"
          onClose={() => setInspectionOpen(false)}
        />
      )}
    </div>
  );
}