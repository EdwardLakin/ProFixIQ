"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";

// Components
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";

type DB = Database;
type CustomerRow  = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow   = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type LineRow      = DB["public"]["Tables"]["work_order_lines"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";
type UploadSummary = { uploaded: number; failed: number };

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // --- Preselects ------------------------------------------------------------
  const [prefillVehicleId, setPrefillVehicleId]   = useTabState<string | null>("prefillVehicleId", null);
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>("prefillCustomerId", null);

  // --- Customer form ---------------------------------------------------------
  const [customerId, setCustomerId] = useTabState<string | null>("customerId", null);
  const [custFirst, setCustFirst]   = useTabState("custFirst", "");
  const [custLast,  setCustLast]    = useTabState("custLast", "");
  const [custPhone, setCustPhone]   = useTabState("custPhone", "");
  const [custEmail, setCustEmail]   = useTabState("custEmail", "");
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", false);

  // Address
  const [custAddress, setCustAddress]   = useTabState("custAddress", "");
  const [custCity, setCustCity]         = useTabState("custCity", "");
  const [custProvince, setCustProvince] = useTabState("custProvince", "");
  const [custPostal, setCustPostal]     = useTabState("custPostal", "");

  // --- Vehicle form ----------------------------------------------------------
  const [vehicleId, setVehicleId] = useTabState<string | null>("vehicleId", null);
  const [vin, setVin]       = useTabState("vin", "");
  const [year, setYear]     = useTabState<string>("year", "");
  const [make, setMake]     = useTabState("make", "");
  const [model, setModel]   = useTabState("model", "");
  const [plate, setPlate]   = useTabState("plate", "");
  const [mileage, setMileage] = useTabState<string>("mileage", "");
  const [unitNumber, setUnitNumber]       = useTabState("unitNumber", "");   // NEW
  const [color, setColor]                 = useTabState("color", "");         // NEW
  const [engineHours, setEngineHours]     = useTabState<string>("engineHours", ""); // NEW

  // --- WO basics -------------------------------------------------------------
  const [type, setType]   = useTabState<WOType>("type", "maintenance");
  const [notes, setNotes] = useTabState("notes", "");

  // --- Uploads ---------------------------------------------------------------
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles]     = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // --- UI state --------------------------------------------------------------
  const [loading, setLoading] = useTabState("loading", false);
  const [error, setError]     = useTabState("error", "");
  const [inviteNotice, setInviteNotice] = useTabState<string>("inviteNotice", "");

  // --- Live WO context -------------------------------------------------------
  const [wo, setWo]       = useTabState<WorkOrderRow | null>("__create_wo", null);
  const [lines, setLines] = useTabState<LineRow[]>("__create_lines", []);

  // Helpers: initials + custom id
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
      .select("id, shop_id")
      .eq("id", userId)
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

    const { error: updErr } = await supabase.from("profiles").update({ shop_id: ownedShop.id }).eq("id", userId);
    if (updErr) throw updErr;

    return ownedShop.id;
  }

  // ----- Read query params ---------------------------------------------------
  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    if (v) setPrefillVehicleId(v);
    if (c) setPrefillCustomerId(c);
  }, [searchParams, setPrefillVehicleId, setPrefillCustomerId]);

  // ----- Prefill data --------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (prefillCustomerId) {
        const { data } = await supabase.from("customers").select("*").eq("id", prefillCustomerId).single();
        if (!cancelled && data) {
          setCustomerId(data.id);
          setCustFirst(data.first_name ?? "");
          setCustLast(data.last_name ?? "");
          setCustPhone(data.phone ?? "");
          setCustEmail(data.email ?? "");
          setCustAddress((data as any)?.address ?? "");
          setCustCity((data as any)?.city ?? "");
          setCustProvince((data as any)?.province ?? "");
          setCustPostal((data as any)?.postal_code ?? "");
        }
      }
      if (prefillVehicleId) {
        const { data } = await supabase
          .from("vehicles")
          .select("id, vin, year, make, model, license_plate, mileage, unit_number, color, engine_hours")
          .eq("id", prefillVehicleId)
          .single();
        if (!cancelled && data) {
          setVehicleId(data.id);
          setVin(data.vin ?? "");
          setYear(data.year ? String(data.year) : "");
          setMake(data.make ?? "");
          setModel(data.model ?? "");
          setPlate(data.license_plate ?? "");
          setMileage(typeof data.mileage === "number" ? String(data.mileage) : "");
          setUnitNumber((data as any)?.unit_number ?? "");
          setColor((data as any)?.color ?? "");
          setEngineHours(
            typeof (data as any)?.engine_hours === "number" ? String((data as any).engine_hours) : ""
          );
        }
      }
    })();
    return () => { cancelled = true; };
  }, [
    prefillCustomerId, prefillVehicleId, supabase,
    setCustomerId, setCustFirst, setCustLast, setCustPhone, setCustEmail,
    setVehicleId, setVin, setYear, setMake, setModel, setPlate, setMileage,
    setCustAddress, setCustCity, setCustProvince, setCustPostal,
    setUnitNumber, setColor, setEngineHours
  ]);

  // ----- Helpers -------------------------------------------------------------
  async function ensureCustomer(): Promise<CustomerRow> {
    if (customerId) {
      const { data } = await supabase.from("customers").select("*").eq("id", customerId).single();
      if (data) return data;
    }
    const query = supabase.from("customers").select("*").limit(1);
    if (custPhone) query.ilike("phone", custPhone);
    else if (custEmail) query.ilike("email", custEmail);
    const { data: found } = await query;
    if (found && found.length > 0) {
      setCustomerId(found[0].id);
      return found[0];
    }
    const toInsert: any = {
      first_name:  custFirst  || null,
      last_name:   custLast   || null,
      phone:       custPhone  || null,
      email:       custEmail  || null,
      address:     custAddress || null,
      city:        custCity     || null,
      province:    custProvince || null,
      postal_code: custPostal   || null,
    };
    const { data: inserted, error: insErr } =
      await supabase.from("customers").insert(toInsert).select("*").single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create customer");
    setCustomerId(inserted.id);
    return inserted;
  }

  async function ensureVehicle(cust: CustomerRow, shopId: string | null): Promise<VehicleRow> {
    if (vehicleId) {
      const { data } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
      if (data) return data;
    }
    let existing: VehicleRow | null = null;
    if (vin || plate) {
      const { data: maybe } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", cust.id)
        .or([vin ? `vin.eq.${vin}` : "", plate ? `license_plate.eq.${plate}` : ""].filter(Boolean).join(","));
      if (maybe && maybe.length > 0) existing = maybe[0] ?? null;
    }
    if (existing) {
      setVehicleId(existing.id);
      return existing;
    }
    const toInsert = {
      customer_id: cust.id,
      vin: vin || null,
      year: year ? Number(year) : null,
      make: make || null,
      model: model || null,
      license_plate: plate || null,
      mileage: mileage ? Number(mileage) : null,
      unit_number: unitNumber || null,     // NEW
      color: color || null,                // NEW
      engine_hours: engineHours ? Number(engineHours) : null, // NEW
      shop_id: shopId,
    };
    const { data: inserted, error: insErr } =
      await supabase.from("vehicles").insert(toInsert).select("*").single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create vehicle");
    setVehicleId(inserted.id);
    return inserted;
  }

  async function uploadVehicleFiles(vId: string): Promise<UploadSummary> {
    let uploaded = 0, failed = 0;
    const { data: { user } } = await supabase.auth.getUser();
    const uploader = user?.id ?? null;

    const uploadAndRecord = async (
      bucket: "vehicle-photos" | "vehicle-docs",
      f: File,
      mediaType: "photo" | "document",
    ) => {
      const key = `veh_${vId}/${Date.now()}_${f.name}`;
      const up = await supabase.storage.from(bucket).upload(key, f, { upsert: false });
      if (up.error) { failed += 1; return; }
      const { error: rowErr } = await supabase.from("vehicle_media").insert({
        vehicle_id: vId, type: mediaType, storage_path: key, uploaded_by: uploader,
      });
      if (rowErr) failed += 1; else uploaded += 1;
    };

    for (const f of photoFiles) await uploadAndRecord("vehicle-photos", f, "photo");
    for (const f of docFiles)   await uploadAndRecord("vehicle-docs",   f, "document");
    return { uploaded, failed };
  }

  const handleDeleteLine = useCallback(async (lineId: string) => {
    if (!wo?.id) return;
    const ok = confirm("Delete this line?");
    if (!ok) return;
    const { error: delErr } = await supabase.from("work_order_lines").delete().eq("id", lineId);
    if (delErr) { alert(delErr.message || "Delete failed"); return; }
    const { data: refreshed } = await supabase
      .from("work_order_lines").select("*")
      .eq("work_order_id", wo.id).order("created_at", { ascending: true });
    setLines(refreshed ?? []);
  }, [supabase, wo?.id, setLines]);

  // ----- Submit --------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(""); setInviteNotice(""); setUploadSummary(null);

    try {
      // If a draft WO already exists, go straight to review
      if (wo?.id) {
        router.push(`/work-orders/quote-review?woId=${wo.id}`);
        return;
      }

      // Fallback path (rare if draft exists): create full WO then route
      if (!custFirst && !custPhone && !custEmail) {
        throw new Error("Please enter at least a name, phone, or email for the customer.");
      }

      const cust = await ensureCustomer();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");

      const { data: profileNames } = await supabase
        .from("profiles").select("first_name, last_name") // full_name removed
        .eq("id", user.id).maybeSingle();

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const veh = await ensureVehicle(cust, shopId);

      const initials = getInitials(
        profileNames?.first_name, profileNames?.last_name, user.email ?? null
      );
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

      if (sendInvite && custEmail) {
        try {
          const origin =
            typeof window !== "undefined"
              ? window.location.origin
              : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
          const portalUrl = `${origin || "https://profixiq.com"}/portal/signup?email=${encodeURIComponent(custEmail)}`;
          const { error: fnErr } = await supabase.functions.invoke("send-portal-invite", {
            body: { email: custEmail, customer_id: cust.id, portal_url: portalUrl },
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

  // Refresh lines (for Quick Add / manual add)
  const fetchLines = useCallback(async () => {
    if (!wo?.id) return;
    const { data } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", wo.id)
      .order("created_at", { ascending: true });
    setLines(data ?? []);
  }, [supabase, wo?.id, setLines]);

  // === Auto-create a DRAFT WO on page load ==================================
  useEffect(() => {
    if (wo?.id) return;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) return;

      const { data: profileNames } = await supabase
        .from("profiles")
        .select("first_name, last_name") // full_name removed
        .eq("id", user.id)
        .maybeSingle();

      const initials = getInitials(
        profileNames?.first_name,
        profileNames?.last_name,
        user.email ?? null // fix: don't read profileNames.email (doesn't exist)
      );
      const customId = await generateCustomId(initials);

      const newId = uuidv4();
      const { data: inserted, error } = await supabase
        .from("work_orders")
        .insert({ id: newId, custom_id: customId, user_id: user.id, shop_id: shopId, status: "draft" })
        .select("*")
        .single();

      if (!error && inserted) {
        setWo(inserted);
        await fetchLines();
      }
    })();
  }, [supabase, wo?.id, setWo, fetchLines]);
  // ==========================================================================

  // Listen for Quick-Add events to refresh list immediately
  useEffect(() => {
    const h = () => { void fetchLines(); };
    window.addEventListener("wo:line-added", h);
    return () => window.removeEventListener("wo:line-added", h);
  }, [fetchLines]);

  // Realtime subscription to lines
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
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [supabase, wo?.id, fetchLines]);

  // ----- UI ------------------------------------------------------------------
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
          {/* Customer */}
          <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-lg font-semibold font-blackops">Customer</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm">First name</label>
                <input value={custFirst} onChange={(e) => setCustFirst(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Jane" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Last name</label>
                <input value={custLast} onChange={(e) => setCustLast(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Doe" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Phone</label>
                <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="(555) 555-5555" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Email</label>
                <input type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="jane@example.com" disabled={loading} />
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-300">
                  <input id="send-invite" type="checkbox" checked={sendInvite}
                    onChange={(e) => setSendInvite(e.target.checked)} className="h-4 w-4" disabled={loading} />
                  <label htmlFor="send-invite">Email a customer portal sign-up link</label>
                </div>
              </div>

              {/* Address */}
              <div className="sm:col-span-2">
                <label className="block text-sm">Address</label>
                <input value={custAddress} onChange={(e) => setCustAddress(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="123 Main St" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">City</label>
                <input value={custCity} onChange={(e) => setCustCity(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Calgary" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Province</label>
                <input value={custProvince} onChange={(e) => setCustProvince(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="AB" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Postal code</label>
                <input value={custPostal} onChange={(e) => setCustPostal(e.target.value.toUpperCase())}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="T0L 1A1" disabled={loading} />
              </div>
            </div>
          </section>

          {/* Vehicle */}
          <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-lg font-semibold font-blackops">Vehicle</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm">VIN</label>
                <input value={vin} onChange={(e) => setVin(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="1HGBH41JXMN109186" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Year</label>
                <input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="2018" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Make</label>
                <input value={make} onChange={(e) => setMake(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Toyota" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Model</label>
                <input value={model} onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Camry" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Plate</label>
                <input value={plate} onChange={(e) => setPlate(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="ABC-123" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Mileage</label>
                <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="123456" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Unit #</label>
                <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Fleet/Asset number" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Color</label>
                <input value={color} onChange={(e) => setColor(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="White" disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Engine hours</label>
                <input inputMode="numeric" value={engineHours} onChange={(e) => setEngineHours(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="1234" disabled={loading} />
              </div>
            </div>
          </section>

          {/* Uploads */}
          <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-lg font-semibold font-blackops">Uploads</h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm">Vehicle Photos</label>
                <input type="file" accept="image/*" multiple
                  onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  disabled={loading} />
              </div>
              <div>
                <label className="block text-sm">Documents (PDF/JPG/PNG)</label>
                <input type="file" accept="application/pdf,image/*" multiple
                  onChange={(e) => setDocFiles(Array.from(e.target.files ?? []))}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  disabled={loading} />
              </div>
            </div>
          </section>

          {/* Quick add + Manual add */}
          {wo?.id && (
            <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-3 text-lg font-semibold text-orange-400 font-blackops">Quick add from menu</h2>
              <MenuQuickAdd workOrderId={wo.id} />
            </section>
          )}

          {wo?.id && (
            <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-2 text-lg font-semibold font-blackops">Add Job Line</h2>
              <NewWorkOrderLineForm
                workOrderId={wo.id}
                vehicleId={vehicleId}
                defaultJobType={type}
                onCreated={fetchLines}
              />
            </section>
          )}

          {/* Current Lines */}
          <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-lg font-semibold font-blackops">Current Lines</h2>
            {!wo?.id || lines.length === 0 ? (
              <p className="text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((ln) => (
                  <div key={ln.id} className="flex items-start justify-between gap-3 rounded border border-neutral-800 bg-neutral-950 p-3">
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

          {/* Work Order defaults */}
          <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-lg font-semibold font-blackops">Work Order</h2>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm">Default job type for added menu items</label>
                <select value={type} onChange={(e) => setType(e.target.value as WOType)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white" disabled={loading}>
                  <option value="maintenance">Maintenance</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="inspection">Inspection</option>
                </select>
              </div>
              <div>
                <label className="block text-sm">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  rows={3} placeholder="Optional notes for technician" disabled={loading} />
              </div>
            </div>
          </section>

          {/* Submit */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
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