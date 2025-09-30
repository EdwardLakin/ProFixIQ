"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type LineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // ---------------------------------------------------------------------------
  // Prefill from querystring (vehicleId, customerId)
  // ---------------------------------------------------------------------------
  const [prefillVehicleId, setPrefillVehicleId] = useTabState<string | null>("prefillVehicleId", null);
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>("prefillCustomerId", null);

  // ---------------------------------------------------------------------------
  // Customer & Vehicle (session-shaped state for CustomerVehicleForm)
  // ---------------------------------------------------------------------------
  const [customer, setCustomer] = useTabState<SessionCustomer>("__cv_customer", {
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    province: null,
    postal_code: null,
  });

  const [vehicle, setVehicle] = useTabState<SessionVehicle>("__cv_vehicle", {
    year: null,
    make: null,
    model: null,
    vin: null,
    license_plate: null,
    mileage: null,
    color: null,
    // extra fields supported by your updated SessionVehicle
    unit_number: null,
    engine_hours: null,
  });

  const onCustomerChange = (field: keyof SessionCustomer, value: string) =>
    setCustomer((c) => ({ ...c, [field]: value }));

  const onVehicleChange = (field: keyof SessionVehicle, value: string) =>
    setVehicle((v) => ({ ...v, [field]: value }));

  // DB ids captured as we create/look up records
  const [customerId, setCustomerId] = useTabState<string | null>("customerId", null);
  const [vehicleId, setVehicleId] = useTabState<string | null>("vehicleId", null);

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
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // UI state
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError] = useTabState("error", "");
  const [inviteNotice, setInviteNotice] = useTabState<string>("inviteNotice", "");
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", false);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getInitials(first?: string | null, last?: string | null, fallback?: string | null): string {
    const f = (first ?? "").trim();
    const l = (last ?? "").trim();
    if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "WO";
    const fb = (fallback ?? "").trim();
    if (fb.includes(" ")) {
      const parts = fb.split(/\s+/);
      return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "WO";
    }
    if (fb.includes("@")) return fb.split("@")[0].slice(0, 2).toUpperCase() || "WO";
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
      const m = (r.custom_id ?? "").match(/^([A-Z]+)(\d{1,})$/i);
      if (m && m[1].toUpperCase() === p) {
        const n = parseInt(m[2], 10);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
    });
    const next = (max + 1).toString().padStart(4, "0");
    return `${p}${next}`;
  }

  async function getOrLinkShopId(userId: string): Promise<string | null> {
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, shop_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr) throw profErr;

    if (profile?.shop_id) return profile.shop_id;

    const { data: ownedShop, error: shopErr } = await supabase
      .from("shops")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (shopErr) throw shopErr;

    if (!ownedShop?.id) return null;

    const { error: updErr } = await supabase.from("profiles").update({ shop_id: ownedShop.id }).eq("user_id", userId);
    if (updErr) throw updErr;

    return ownedShop.id;
  }

  // Convert session → DB inserts
  const buildCustomerInsert = (c: SessionCustomer) => ({
    first_name: c.first_name || null,
    last_name: c.last_name || null,
    phone: c.phone || null,
    email: c.email || null,
    address: c.address || null,
    city: c.city || null,
    province: c.province || null,
    postal_code: c.postal_code || null,
  });

  const buildVehicleInsert = (v: SessionVehicle, customerId: string, shopId: string | null) => ({
    customer_id: customerId,
    vin: v.vin || null,
    year: v.year ? Number(v.year) : null,
    make: v.make || null,
    model: v.model || null,
    license_plate: v.license_plate || null,
    mileage: v.mileage || null, // DB type is string | null
    unit_number: v.unit_number || null,
    color: v.color || null,
    engine_hours: v.engine_hours ? Number(v.engine_hours) : null,
    shop_id: shopId,
  });

  // ---------------------------------------------------------------------------
  // Read query params for prefill
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    if (v) setPrefillVehicleId(v);
    if (c) setPrefillCustomerId(c);
  }, [searchParams, setPrefillVehicleId, setPrefillCustomerId]);

  // ---------------------------------------------------------------------------
  // Prefill from DB → session shapes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (prefillCustomerId) {
        const { data } = await supabase.from("customers").select("*").eq("id", prefillCustomerId).single();
        if (!cancelled && data) {
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
        const { data } = await supabase
          .from("vehicles")
          .select("id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours")
          .eq("id", prefillVehicleId)
          .single();
        if (!cancelled && data) {
          setVehicle({
            vin: data.vin ?? null,
            year: data.year != null ? String(data.year) : null,
            make: data.make ?? null,
            model: data.model ?? null,
            license_plate: data.license_plate ?? null,
            mileage: data.mileage ?? null,
            unit_number: (data as any).unit_number ?? null,
            color: (data as any).color ?? null,
            engine_hours: (data as any).engine_hours != null ? String((data as any).engine_hours) : null,
          });
          setVehicleId(data.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillCustomerId, prefillVehicleId, supabase, setCustomer, setVehicle, setCustomerId, setVehicleId]);

  // ---------------------------------------------------------------------------
  // Ensure / create customer + vehicle
  // ---------------------------------------------------------------------------
  async function ensureCustomer(): Promise<CustomerRow> {
    if (customerId) {
      const { data } = await supabase.from("customers").select("*").eq("id", customerId).single();
      if (data) return data;
    }

    // Try find by phone/email
    const query = supabase.from("customers").select("*").limit(1);
    if (customer.phone) query.ilike("phone", customer.phone);
    else if (customer.email) query.ilike("email", customer.email);
    const { data: found } = await query;
    if (found && found.length > 0) {
      setCustomerId(found[0].id);
      return found[0];
    }

    // Insert
    const { data: inserted, error: insErr } = await supabase
      .from("customers")
      .insert(buildCustomerInsert(customer))
      .select("*")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create customer");
    setCustomerId(inserted.id);
    return inserted;
  }

  async function ensureVehicleRow(cust: CustomerRow, shopId: string | null): Promise<VehicleRow> {
    if (vehicleId) {
      const { data } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
      if (data) return data;
    }

    // Attempt match by vin/plate
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
        return maybe[0];
      }
    }

    // Insert
    const { data: inserted, error: insErr } = await supabase
      .from("vehicles")
      .insert(buildVehicleInsert(vehicle, cust.id, shopId))
      .select("*")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create vehicle");
    setVehicleId(inserted.id);
    return inserted;
  }

  // ---------------------------------------------------------------------------
  // Upload helpers
  // ---------------------------------------------------------------------------
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
      });
      if (rowErr) failed += 1;
      else uploaded += 1;
    };

    for (const f of photoFiles) await uploadAndRecord("vehicle-photos", f, "photo");
    for (const f of docFiles) await uploadAndRecord("vehicle-docs", f, "document");
    return { uploaded, failed };
  }

  // ---------------------------------------------------------------------------
  // Delete line
  // ---------------------------------------------------------------------------
  const handleDeleteLine = useCallback(
    async (lineId: string) => {
      if (!wo?.id) return;
      const ok = confirm("Delete this line?");
      if (!ok) return;
      const { error: delErr } = await supabase.from("work_order_lines").delete().eq("id", lineId);
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
    [supabase, wo?.id, setLines],
  );

  // ---------------------------------------------------------------------------
  // Submit: finalize and jump to review
  // ---------------------------------------------------------------------------
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
        throw new Error("Please enter at least a name, phone, or email for the customer.");
      }

      const cust = await ensureCustomer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const { data: profileNames } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const veh = await ensureVehicleRow(cust, shopId);

      const initials = getInitials(profileNames?.first_name, profileNames?.last_name, user.email ?? null);
      const customId = await generateCustomId(initials);

      const newId = uuidv4();
      const { data: inserted, error: insertWOError } = await supabase
        .from("work_orders")
        .insert({
          id: newId,
          custom_id: customId,
          vehicle_id: veh.id,
          customer_id: cust.id,
          notes,
          user_id: user.id,
          shop_id: shopId,
          status: "awaiting_approval",
        })
        .select("*")
        .single();

      if (insertWOError || !inserted) throw new Error(insertWOError?.message || "Failed to create work order.");
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
          const portalUrl = `${origin || "https://profixiq.com"}/portal/signup?email=${encodeURIComponent(
            customer.email,
          )}`;
          const { error: fnErr } = await supabase.functions.invoke("send-portal-invite", {
            body: { email: customer.email, customer_id: cust.id, portal_url: portalUrl },
          });
          if (fnErr) setInviteNotice("Work order created. Failed to send invite email (logged).");
          else setInviteNotice("Work order created. Invite email queued to the customer.");
        } catch {
          setInviteNotice("Work order created. Failed to send invite email (caught).");
        }
      }

      router.push(`/work-orders/quote-review?woId=${inserted.id}`);
      return;
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "Failed to create work order.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch lines + realtime
  // ---------------------------------------------------------------------------
  const fetchLines = useCallback(async () => {
    if (!wo?.id) return;
    const { data } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });
    setLines(data ?? []);
  }, [supabase, wo?.id, setLines]);

  useEffect(() => {
    if (!wo?.id) return;
    void fetchLines();
    const ch = supabase
      .channel(`create-wo:${wo.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines", filter: `work_order_id=eq.${wo.id}` },
        () => fetchLines(),
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

  // ---------------------------------------------------------------------------
  // Auto-create WO (placeholder customer & vehicle) so the page is functional
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (wo?.id) return;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) return;

      const { data: profileNames } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", user.id)
        .maybeSingle();

      // 1) Ensure placeholder customer
      let placeholderCustomer: CustomerRow | null = null;
      {
        const { data } = await supabase
          .from("customers")
          .select("*")
          .ilike("first_name", "Walk-in")
          .ilike("last_name", "Customer")
          .limit(1);
        if (data && data.length) placeholderCustomer = data[0] as CustomerRow;
      }
      if (!placeholderCustomer) {
        const { data } = await supabase
          .from("customers")
          .insert({ first_name: "Walk-in", last_name: "Customer" })
          .select("*")
          .single();
        placeholderCustomer = data as CustomerRow;
      }

      // 2) Ensure placeholder vehicle
      const { data: maybeVeh } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", placeholderCustomer!.id)
        .ilike("model", "Unassigned")
        .limit(1);
      let placeholderVehicle: VehicleRow | null = maybeVeh && maybeVeh.length ? (maybeVeh[0] as VehicleRow) : null;

      if (!placeholderVehicle) {
        const { data } = await supabase
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
        placeholderVehicle = data as VehicleRow;
      }

      // 3) Create WO row
      const initials = getInitials(profileNames?.first_name, profileNames?.last_name, user.email ?? null);
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
        setError(error.message ?? "Failed to auto-create work order.");
      }
    })();
  }, [supabase, wo?.id, setWo, fetchLines, setError]);

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-5xl p-6 text-white font-roboto">
      <h1 className="mb-6 text-2xl font-bold font-blackops">Create Work Order</h1>

      {error && <div className="mb-4 rounded bg-red-100 px-4 py-2 text-red-700">{error}</div>}

      {uploadSummary && (
        <div className="mb-4 rounded bg-neutral-800 px-4 py-2 text-neutral-200 text-sm">
          Uploaded {uploadSummary.uploaded} file(s){uploadSummary.failed ? `, ${uploadSummary.failed} failed` : ""}.
        </div>
      )}
      {inviteNotice && (
        <div className="mb-4 rounded bg-neutral-800 px-4 py-2 text-neutral-200 text-sm">{inviteNotice}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6">
          {/* Customer & Vehicle — session-shaped form */}
          <section className="card">
            <h2 className="font-header text-lg mb-3">Customer &amp; Vehicle</h2>
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
              <label htmlFor="send-invite">Email a customer portal sign-up link</label>
            </div>
          </section>

          {/* Uploads */}
          <section className="card">
            <h2 className="font-header text-lg mb-2">Uploads</h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm mb-1">Vehicle Photos</label>
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
                <label className="block text-sm mb-1">Documents (PDF/JPG/PNG)</label>
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
              <h2 className="font-header text-lg mb-3 text-orange-400">Quick add from menu</h2>
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
                onCreated={fetchLines}
              />
            </section>
          )}

          {/* Current Lines */}
          <section className="card">
            <h2 className="font-header text-lg mb-2">Current Lines</h2>
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
                      <div className="truncate font-medium">{ln.description || ln.complaint || "Untitled job"}</div>
                      <div className="text-xs text-neutral-400">
                        {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                        {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} •{" "}
                        {(ln.status ?? "awaiting").replaceAll("_", " ")}
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

          {/* WO defaults */}
          <section className="card">
            <h2 className="font-header text-lg mb-2">Work Order</h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm mb-1">Default job type for added menu items</label>
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
    </div>
  );
}