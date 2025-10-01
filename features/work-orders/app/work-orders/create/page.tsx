"use client";

/**
 * Create Work Order (Front Desk)
 * ---------------------------------------------------------------------------
 * This page lets the front desk:
 *  - Enter Customer + Vehicle information (session-shaped form).
 *  - Attach photos and documents to the vehicle immediately.
 *  - Auto-create a Work Order row ASAP so QuickAdd + Manual Add Line can mount.
 *  - Add lines (jobs) manually or via the menu.
 *  - See current lines with live updates.
 *  - Jump to Quote Review & Signature once ready.
 *
 * Design Notes
 * ------------
 * - Fonts: Roboto body, Black Ops One for titles (already wired in layout/tailwind).
 * - Inputs: use `.input` from globals.css (white text, orange focus ring).
 * - We never rely on profile `full_name`. We only use `first_name/last_name`
 *   on customers (if provided), otherwise fall back to the current user's email
 *   when generating the "custom_id" prefix.
 *
 * RLS Considerations
 * ------------------
 * - work_orders policies require either (shop_id = current_shop_id()) OR
 *   "by profile shop" (exists profile match). We set `shop_id` on insert.
 * - work_order_lines insert requires (shop_id = current_shop_id()). We therefore
 *   pass `shopId={wo.shop_id}` into NewWorkOrderLineForm so it inserts with that.
 *
 * DB Columns Used
 * ---------------
 *  customers: id, first_name, last_name, phone/phone_number, email,
 *             address, city, province, postal_code, shop_id (nullable)
 *  vehicles : id, customer_id, shop_id, vin, year(int), make, model,
 *             license_plate, mileage(text), unit_number(text), color(text),
 *             engine_hours(int)
 *  work_orders: id, custom_id, user_id, shop_id, customer_id, vehicle_id,
 *               status, notes, created_at (etc.)
 *  work_order_lines: id, work_order_id, vehicle_id, user_id, shop_id,
 *                    complaint, cause, correction, labor_time(numeric),
 *                    job_type(text), status(text), created_at, ...
 *
 * ---------------------------------------------------------------------------
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";

// UI blocks
import CustomerVehicleForm from "@/features/inspections/components/inspection/CustomerVehicleForm";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";

// Session (form) types
import type {
  SessionCustomer,
  SessionVehicle,
} from "@/features/inspections/lib/inspection/types";

/* =============================================================================
   Type Aliases
============================================================================= */
type DB = Database;

type WorkOrderTable = DB["public"]["Tables"]["work_orders"];
type WorkOrderRow = WorkOrderTable["Row"];
type WorkOrderInsert = WorkOrderTable["Insert"];

type LineTable = DB["public"]["Tables"]["work_order_lines"];
type LineRow = LineTable["Row"];

type CustomerTable = DB["public"]["Tables"]["customers"];
type CustomerRow = CustomerTable["Row"];
type CustomerInsert = CustomerTable["Insert"];

type VehicleTable = DB["public"]["Tables"]["vehicles"];
type VehicleRow = VehicleTable["Row"];
type VehicleInsert = VehicleTable["Insert"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

/* =============================================================================
   Tiny Utilities
============================================================================= */


/** Normalize a string field to (string|null). */
function strOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

/** Convert possibly-numberish string to number | null. */
function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* =============================================================================
   Component
============================================================================= */
export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // ---------------------------------------------------------------------------
  // Prefill from querystring (vehicleId, customerId)
  // ---------------------------------------------------------------------------
  const [prefillVehicleId, setPrefillVehicleId] = useTabState<string | null>(
    "prefillVehicleId",
    null
  );
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>(
    "prefillCustomerId",
    null
  );

  // Also keep a tiny trace for debugging view (optional)
  const [sourceFlags, setSourceFlags] = useTabState<{
    queryVehicle: boolean;
    queryCustomer: boolean;
    autoWO: boolean;
  }>("__create_sources", { queryVehicle: false, queryCustomer: false, autoWO: false });

  // ---------------------------------------------------------------------------
  // Customer & Vehicle (session-shaped state for CustomerVehicleForm)
  // ---------------------------------------------------------------------------
  const [customer, setCustomer] = useTabState<SessionCustomer>(
    "__cv_customer",
    {
      first_name: null,
      last_name: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      province: null,
      postal_code: null,
    }
  );

  const [vehicle, setVehicle] = useTabState<SessionVehicle>("__cv_vehicle", {
    year: null,
    make: null,
    model: null,
    vin: null,
    license_plate: null,
    mileage: null,           // DB is text
    color: null,
    unit_number: null,       // DB is text
    engine_hours: null,      // DB is integer
  });

  // 🔧 accept string | null (form emits nulls for empty)
  const onCustomerChange = (
    field: keyof SessionCustomer,
    value: string | null
  ) => setCustomer((c) => ({ ...c, [field]: value }));

  const onVehicleChange = (
    field: keyof SessionVehicle,
    value: string | null
  ) => setVehicle((v) => ({ ...v, [field]: value }));

  // DB ids captured as we create/look up records
  const [customerId, setCustomerId] = useTabState<string | null>(
    "customerId",
    null
  );
  const [vehicleId, setVehicleId] = useTabState<string | null>(
    "vehicleId",
    null
  );

  // ---------------------------------------------------------------------------
  // Work order context + lines
  // ---------------------------------------------------------------------------
  const [wo, setWo] = useTabState<WorkOrderRow | null>("__create_wo", null);
  const [lines, setLines] = useTabState<LineRow[]>("__create_lines", []);

  // Defaults / notes
  const [type, setType] = useTabState<WOType>("type", "maintenance");
  const [notes, setNotes] = useTabState("notes", "");

  // Uploads
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(
    null
  );

  // UI state
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError] = useTabState("error", "");
  const [inviteNotice, setInviteNotice] = useTabState<string>(
    "inviteNotice",
    ""
  );
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", false);

  // Track current user for initials fallback + auth guard
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [, setCurrentUserId] = useState<string | null>(null);

  // keep a "isMount" ref for guarding useEffects if ever needed
  const isMounted = useRef(false);

  /* ===========================================================================
     CURRENT USER
  ============================================================================*/
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserEmail(user?.email ?? null);
      setCurrentUserId(user?.id ?? null);
    })();
  }, [supabase]);

  /* ===========================================================================
     HELPERS
  ============================================================================*/

  /**
   * getInitials
   * ----------
   * 1) If we have a first/last pair, use first letter of each.
   * 2) Else if we have an email, use first 2 chars of the local part.
   * 3) Else fallback to "WO".
   */
  function getInitials(
    first?: string | null,
    last?: string | null,
    fallback?: string | null
  ): string {
    const f = (first ?? "").trim();
    const l = (last ?? "").trim();
    if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "WO";
    const fb = (fallback ?? "").trim();
    if (fb.includes("@")) return fb.split("@")[0].slice(0, 2).toUpperCase() || "WO";
    return fb.slice(0, 2).toUpperCase() || "WO";
  }

  /**
   * generateCustomId
   * ----------------
   * Build a monotonic ID like "AB0001", "AB0002" using a short alphabetic prefix.
   * We scan recent rows with same prefix and pick the next count.
   */
  async function generateCustomId(prefix: string): Promise<string> {
    const p = prefix.replace(/[^A-Z]/g, "").slice(0, 3) || "WO";
    const { data, error } = await supabase
      .from("work_orders")
      .select("custom_id")
      .ilike("custom_id", `${p}%`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // Avoid blocking WO creation due to a read error
      console.warn("[create] generateCustomId warning:", error.message);
    }

    let max = 0;
    (data ?? []).forEach((r) => {
      const m = (r.custom_id ?? "").match(/^([A-Z]+)(\d{1,})$/i);
      if (m && m[1].toUpperCase() === p) {
        const n = parseInt(m[2], 10);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
    });
    const next = (max + 1).toString().padStart(4, "0");
    return `${p}${next}`;
  }

  /**
   * getOrLinkShopId
   * ---------------
   * We only need `shop_id`; do not read profile name fields. If no profile.shop_id,
   * try linking to owned shop (owner_id == userId). Otherwise return null.
   */
  async function getOrLinkShopId(userId: string): Promise<string | null> {
    // We only need shop_id here; avoid relying on profile name fields
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, shop_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) throw profErr;

    if (profile?.shop_id) return profile.shop_id;

    // If there is logic to link shop from ownership, keep it — otherwise return null
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
      .eq("user_id", userId);
    if (updErr) throw updErr;

    return ownedShop.id;
  }

  /**
   * buildCustomerInsert
   * -------------------
   * Session → DB insert payload (customers table).
   */
  const buildCustomerInsert = (c: SessionCustomer): CustomerInsert => ({
    first_name: strOrNull(c.first_name),
    last_name: strOrNull(c.last_name),
    phone: strOrNull(c.phone),
    email: strOrNull(c.email),
    address: strOrNull(c.address),
    city: strOrNull(c.city),
    province: strOrNull(c.province),
    postal_code: strOrNull(c.postal_code),
    // shop_id: nullable; we don't force it here
  });

  /**
   * buildVehicleInsert
   * ------------------
   * Session → DB insert payload (vehicles table).
   */
  const buildVehicleInsert = (
    v: SessionVehicle,
    customerId: string,
    shopId: string | null
  ): VehicleInsert => ({
    customer_id: customerId,
    vin: strOrNull(v.vin),
    year: numOrNull(v.year),
    make: strOrNull(v.make),
    model: strOrNull(v.model),
    license_plate: strOrNull(v.license_plate),
    mileage: strOrNull(v.mileage),         // DB is text | null
    unit_number: strOrNull(v.unit_number), // DB is text | null
    color: strOrNull(v.color),
    engine_hours: numOrNull(v.engine_hours), // DB is int | null
    shop_id: shopId ?? null,
  });

  /* ===========================================================================
     READ QUERY PARAMS FOR PREFILL
  ============================================================================*/
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

  /* ===========================================================================
     PREFILL FROM DB → SESSION SHAPES
  ============================================================================*/
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (prefillCustomerId) {
          const { data, error } = await supabase
            .from("customers")
            .select("*")
            .eq("id", prefillCustomerId)
            .single();

          if (!cancelled && data && !error) {
            setCustomer({
              first_name: data.first_name ?? null,
              last_name: data.last_name ?? null,
              phone: (data as any).phone ?? (data as any).phone_number ?? null,
              email: data.email ?? null,
              address: (data as any).address ?? null,
              city: (data as any).city ?? null,
              province: (data as any).province ?? null,
              postal_code: (data as any).postal_code ?? null,
            });
            setCustomerId(data.id);
          }
        }

        if (prefillVehicleId) {
          const { data, error } = await supabase
            .from("vehicles")
            .select(
              "id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours, customer_id, shop_id"
            )
            .eq("id", prefillVehicleId)
            .single();

          if (!cancelled && data && !error) {
            setVehicle({
              vin: data.vin ?? null,
              year: data.year != null ? String(data.year) : null,
              make: data.make ?? null,
              model: data.model ?? null,
              license_plate: data.license_plate ?? null,
              mileage: (data as any).mileage ?? null,
              unit_number: (data as any).unit_number ?? null,
              color: (data as any).color ?? null,
              engine_hours:
                (data as any).engine_hours != null
                  ? String((data as any).engine_hours)
                  : null,
            });
            setVehicleId(data.id);
            // If we didn't have customer but the vehicle points to one, hydrate it
            if (!customerId && data.customer_id) {
              const { data: cust } = await supabase
                .from("customers")
                .select("*")
                .eq("id", data.customer_id)
                .maybeSingle();
              if (cust) {
                setCustomer({
                  first_name: cust.first_name ?? null,
                  last_name: cust.last_name ?? null,
                  phone: (cust as any).phone ?? (cust as any).phone_number ?? null,
                  email: cust.email ?? null,
                  address: (cust as any).address ?? null,
                  city: (cust as any).city ?? null,
                  province: (cust as any).province ?? null,
                  postal_code: (cust as any).postal_code ?? null,
                });
                setCustomerId(cust.id);
              }
            }
          }
        }
      } catch (err) {
        console.warn("[create] prefill error", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* ===========================================================================
     ENSURE / CREATE CUSTOMER + VEHICLE
  ============================================================================*/
  async function ensureCustomer(): Promise<CustomerRow> {
    if (customerId) {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();
      if (data) return data;
    }

    // Try find by phone/email
    const normalizedPhone = strOrNull(customer.phone);
    const normalizedEmail = strOrNull(customer.email);

    if (normalizedPhone || normalizedEmail) {
      let q = supabase.from("customers").select("*").limit(1);

      // Prioritize phone match if available; else use email
      if (normalizedPhone) q = q.ilike("phone", normalizedPhone);
      else if (normalizedEmail) q = q.ilike("email", normalizedEmail);

      const { data: found } = await q;
      if (found && found.length > 0) {
        setCustomerId(found[0].id);
        return found[0];
      }
    }

    // Insert minimal row (RLS will allow if authenticated)
    const insertPayload = buildCustomerInsert(customer);
    const { data: inserted, error: insErr } = await supabase
      .from("customers")
      .insert(insertPayload)
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

    // Attempt match by vin/plate for this customer
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
      if (maybe && maybe.length > 0) {
        setVehicleId(maybe[0].id);
        return maybe[0] as VehicleRow;
      }
    }

    // Insert
    const insertPayload = buildVehicleInsert(vehicle, cust.id, shopId);
    const { data: inserted, error: insErr } = await supabase
      .from("vehicles")
      .insert(insertPayload)
      .select("*")
      .single();
    if (insErr || !inserted)
      throw new Error(insErr?.message ?? "Failed to create vehicle");
    setVehicleId(inserted.id);
    return inserted as VehicleRow;
  }

  /* ===========================================================================
     UPLOAD HELPERS
  ============================================================================*/
  async function uploadVehicleFiles(vId: string): Promise<UploadSummary> {
    let uploaded = 0,
      failed = 0;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uploader = user?.id ?? null;

    const uploadAndRecord = async (
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
      });
      if (rowErr) failed += 1;
      else uploaded += 1;
    };

    for (const f of photoFiles) await uploadAndRecord("vehicle-photos", f, "photo");
    for (const f of docFiles) await uploadAndRecord("vehicle-docs", f, "document");
    return { uploaded, failed };
  }

  /* ===========================================================================
     DELETE LINE
  ============================================================================*/
  const handleDeleteLine = useCallback(
    async (lineId: string) => {
      if (!wo?.id) return;
      const ok = confirm("Delete this line?");
      if (!ok) return;
      const { error: delErr } = await supabase
        .from("work_order_lines")
        .delete()
        .eq("id", lineId);
      if (delErr) {
        alert(delErr.message || "Delete failed");
        return;
      }
      const { data: refreshed } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", wo.id)
        .order("created_at", { ascending: true });
      setLines(refreshed ?? []);
    },
    [supabase, wo?.id, setLines]
  );

  /* ===========================================================================
     SUBMIT: finalize and jump to review
  ============================================================================*/
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setInviteNotice("");
    setUploadSummary(null);

    try {
      // If we already created a WO (auto phase), just proceed to review
      if (wo?.id) {
        router.push(`/work-orders/quote-review?woId=${wo.id}`);
        return;
      }

      // Full create path (safety)
      if (!customer.first_name && !customer.phone && !customer.email) {
        throw new Error(
          "Please enter at least a name, phone, or email for the customer."
        );
      }

      const cust = await ensureCustomer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const veh = await ensureVehicleRow(cust, shopId);

      // Initials from customer first/last if present; fallback to user's email
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
        status: "awaiting_approval", // allowed by your check constraint
      };

      const { data: inserted, error: insertWOError } = await supabase
        .from("work_orders")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insertWOError || !inserted)
        throw new Error(insertWOError?.message || "Failed to create work order.");
      setWo(inserted);

      if (photoFiles.length || docFiles.length) {
        const summary = await uploadVehicleFiles(veh.id);
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
              body: { email: customer.email, customer_id: cust.id, portal_url: portalUrl },
            }
          );
          if (fnErr)
            setInviteNotice(
              "Work order created. Failed to send invite email (logged)."
            );
          else setInviteNotice("Work order created. Invite email queued to the customer.");
        } catch {
          setInviteNotice(
            "Work order created. Failed to send invite email (caught)."
          );
        }
      }

      router.push(`/work-orders/quote-review?woId=${inserted.id}`);
      return;
    } catch (ex) {
      const message =
        ex instanceof Error ? ex.message : "Failed to create work order.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  /* ===========================================================================
     FETCH LINES + REALTIME
  ============================================================================*/
  const fetchLines = useCallback(async () => {
    if (!wo?.id) return;
    const { data, error } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });
    if (!error) {
      setLines(data ?? []);
    } else {
      console.warn("[create] fetchLines error:", error.message);
    }
  }, [supabase, wo?.id, setLines]);

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
      } catch {}
    };
  }, [supabase, wo?.id, fetchLines]);

  useEffect(() => {
    const h = () => {
      void fetchLines();
    };
    window.addEventListener("wo:line-added", h);
    return () => window.removeEventListener("wo:line-added", h);
  }, [fetchLines]);

  /* ===========================================================================
     AUTO-CREATE WO (placeholder customer & vehicle) so the page is functional
  ============================================================================*/
  useEffect(() => {
    // Guard: only on mount and only if not already created
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

      // 1) Ensure a placeholder customer (min fields to pass NOT NULL/RLS)
      let placeholderCustomer: CustomerRow | null = null;

      try {
        const { data } = await supabase
          .from("customers")
          .select("*")
          .ilike("first_name", "Walk-in")
          .ilike("last_name", "Customer")
          .limit(1);
        if (data && data.length) placeholderCustomer = data[0] as CustomerRow;
      } catch (err) {
        console.warn("[create] check placeholder customer error", err);
      }

      if (!placeholderCustomer) {
        const { data, error } = await supabase
          .from("customers")
          .insert({ first_name: "Walk-in", last_name: "Customer" })
          .select("*")
          .single();
        if (!error && data) placeholderCustomer = data as CustomerRow;
      }

      if (!placeholderCustomer) {
        setError("Could not ensure a placeholder customer for auto-create.");
        return;
      }

      // 2) Ensure a placeholder vehicle tied to that customer + shop
      const { data: maybeVeh } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", placeholderCustomer!.id)
        .ilike("model", "Unassigned")
        .limit(1);
      let placeholderVehicle: VehicleRow | null =
        maybeVeh && maybeVeh.length ? (maybeVeh[0] as VehicleRow) : null;

      if (!placeholderVehicle) {
        const { data, error } = await supabase
          .from("vehicles")
          .insert({
            customer_id: placeholderCustomer!.id,
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

        if (!error && data) placeholderVehicle = data as VehicleRow;
      }

      if (!placeholderVehicle) {
        setError("Could not ensure a placeholder vehicle for auto-create.");
        return;
      }

      // 3) Create the WO row right away so QuickAdd + LineForm can mount
      const initials = getInitials(
        // Use placeholder customer or fallback to current user email
        placeholderCustomer?.first_name ?? customer.first_name,
        placeholderCustomer?.last_name ?? customer.last_name,
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
          customer_id: placeholderCustomer!.id,
          vehicle_id: placeholderVehicle!.id,
          status: "awaiting_approval",
        })
        .select("*")
        .single();

      if (!error && inserted) {
        setWo(inserted);
        await fetchLines();
      } else if (error) {
        // Surface the reason so you can see the real PostgREST message if any
        setError(error.message ?? "Failed to auto-create work order.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, wo?.id, setWo, fetchLines, setError, currentUserEmail, customer.first_name, customer.last_name]);

  /* ===========================================================================
     UI SECTIONS
  ============================================================================*/

  // Small inline component for section headers (keeps fonts consistent)
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h2 className="font-header text-lg mb-2">{children}</h2>
  );

  return (
    <div className="mx-auto max-w-5xl p-6 text-white font-roboto">
      {/* Page Title */}
      <h1 className="mb-6 text-2xl font-bold font-blackops">Create Work Order</h1>

      {/* Error / Notices */}
      {error && (
        <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 px-4 py-2 text-red-300">
          {error}
        </div>
      )}

      {uploadSummary && (
        <div className="mb-4 rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-neutral-200 text-sm">
          Uploaded {uploadSummary.uploaded} file(s)
          {uploadSummary.failed ? `, ${uploadSummary.failed} failed` : ""}.
        </div>
      )}
      {inviteNotice && (
        <div className="mb-4 rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-neutral-200 text-sm">
          {inviteNotice}
        </div>
      )}

      {/* DEBUG: show sources used (optional, can be removed) */}
      <div className="mb-3 text-xs text-neutral-500">
        <span className="mr-2">Prefill (customer): {sourceFlags.queryCustomer ? "yes" : "no"}</span>
        <span className="mr-2">Prefill (vehicle): {sourceFlags.queryVehicle ? "yes" : "no"}</span>
        <span>Auto-WO: {sourceFlags.autoWO ? "yes" : "no"}</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6">
          {/* Customer & Vehicle — session-shaped form */}
          <section className="card">
            <SectionTitle>Customer &amp; Vehicle</SectionTitle>
            <CustomerVehicleForm
              customer={customer}
              vehicle={vehicle}
              onCustomerChange={onCustomerChange}
              onVehicleChange={onVehicleChange}
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-neutral-300">
              <input
                id="send-invite"
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="h-4 w-4"
                disabled={loading}
              />
              <label htmlFor="send-invite">
                Email a customer portal sign-up link
              </label>
            </div>
          </section>

          {/* Uploads */}
          <section className="card">
            <SectionTitle>Uploads</SectionTitle>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm mb-1">Vehicle Photos</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    setPhotoFiles(Array.from(e.target.files ?? []))
                  }
                  className="input"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">
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
            <section className="card">
              <h2 className="font-header text-lg mb-3 text-orange-400">
                Quick add from menu
              </h2>
              {/* No extra props required; MenuQuickAdd reads by work order id */}
              <MenuQuickAdd workOrderId={wo.id} />
            </section>
          )}

          {/* Manual add line */}
          {wo?.id && (
            <section className="card">
            <h2 className="font-header text-lg mb-2">Add Job Line</h2>
                <NewWorkOrderLineForm
                  workOrderId={wo.id}
                  vehicleId={vehicleId}
                  defaultJobType={type}
                  shopId={wo.shop_id ?? undefined}     
                  onCreated={fetchLines}
                />
              </section>
            )}

          {/* Current Lines */}
          <section className="card">
            <SectionTitle>Current Lines</SectionTitle>
            {!wo?.id || lines.length === 0 ? (
              <p className="text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((ln) => (
                  <div
                    key={ln.id}
                    className="flex items-start justify-between gap-3 rounded border border-neutral-800 bg-neutral-950 p-3"
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
                        <div className="text-xs text-neutral-400 mt-1">
                          {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                          {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                          {ln.correction ? `| Corr: ${ln.correction}` : ""}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteLine(ln.id)}
                      className="rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:bg-red-900/20"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Work Order defaults */}
          <section className="card">
            <SectionTitle>Work Order</SectionTitle>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm mb-1">
                  Default job type for added menu items
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
                <label className="block text-sm mb-1">Notes</label>
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
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-orange disabled:opacity-60"
              title={wo?.id ? "Proceed to review" : "Create and proceed"}
            >
              {loading ? "Creating..." : "Done → Review & Sign"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/work-orders")}
              className="text-sm text-neutral-400 hover:underline"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>

      {/* Footer note for support */}
      <div className="mt-6 text-xs text-neutral-500">
        If you experience issues adding lines, verify that <code>wo.shop_id</code> is set and
        that your RLS policies on <code>work_order_lines</code> accept
        <code>shop_id = current_shop_id()</code>. This form passes <code>shopId</code> to the insert.
      </div>
    </div>
  );
}