// app/work-orders/create/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useTabState } from "@/features/shared/hooks/useTabState";

type DB = Database;
type MenuItem   = DB["public"]["Tables"]["menu_items"]["Row"];
type Customer   = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle    = DB["public"]["Tables"]["vehicles"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";

type UploadSummary = { uploaded: number; failed: number };

export default function CreateWorkOrderPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ------- preselects from URL / tab state
  const [prefillVehicleId, setPrefillVehicleId] = useTabState<string | null>("prefillVehicleId", null);
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>("prefillCustomerId", null);
  const [inspectionId,     setInspectionId]     = useTabState<string | null>("inspectionId", null);

  // ------- customer form
  const [customerId, setCustomerId] = useTabState<string | null>("customerId", null);
  const [custFirst, setCustFirst]   = useTabState("custFirst", "");
  const [custLast,  setCustLast]    = useTabState("custLast", "");
  const [custPhone, setCustPhone]   = useTabState("custPhone", "");
  const [custEmail, setCustEmail]   = useTabState("custEmail", "");
  const [sendInvite, setSendInvite] = useTabState<boolean>("sendInvite", false);

  // ------- vehicle form
  const [vehicleId, setVehicleId] = useTabState<string | null>("vehicleId", null);
  const [vin,    setVin]    = useTabState("vin", "");
  const [year,   setYear]   = useTabState<string>("year", "");
  const [make,   setMake]   = useTabState("make", "");
  const [model,  setModel]  = useTabState("model", "");
  const [plate,  setPlate]  = useTabState("plate", "");
  const [mileage,setMileage]= useTabState<string>("mileage", "");

  // ------- work order basics
  const [type,  setType]  = useTabState<WOType>("type", "maintenance"); // default for menu quick-add
  const [notes, setNotes] = useTabState("notes", "");

  // ------- menu quick add
  const [menuItems,   setMenuItems]   = useTabState<MenuItem[]>("menuItems", []);
  const [selectedIds, setSelectedIds] = useTabState<string[]>("selectedIds", []);

  // ------- uploads (kept out of tab-state; File isn't serializable)
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles,   setDocFiles]   = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // ------- ui
  const [loading, setLoading] = useTabState("loading", false);
  const [error,   setError]   = useTabState("error", "");
  const [inviteNotice, setInviteNotice] = useTabState("inviteNotice", "");

  // ========== helpers
  function getInitials(first?: string | null, last?: string | null, fallback?: string | null): string {
    const f = (first ?? "").trim();
    const l = (last ?? "").trim();
    if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "WO";
    const fb = (fallback ?? "").trim();
    if (fb.includes(" ")) {
      const [a = "", b = ""] = fb.split(/\s+/);
      return `${a[0] ?? ""}${b[0] ?? ""}`.toUpperCase() || "WO";
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
        const n = Number(m[2]);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
    });
    const next = String(max + 1).padStart(4, "0");
    return `${p}${next}`;
  }

  // Ensure profile has a shop_id (repair one if user owns a shop)
  async function getOrLinkShopId(userId: string): Promise<string | null> {
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, shop_id")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) throw profErr;
    if (profile?.shop_id) return profile.shop_id;

    const { data: owned, error: shopErr } = await supabase.from("shops").select("id").eq("owner_id", userId).maybeSingle();
    if (shopErr) throw shopErr;
    if (!owned?.id) return null;

    const { error: updErr } = await supabase.from("profiles").update({ shop_id: owned.id }).eq("id", userId);
    if (updErr) throw updErr;
    return owned.id;
  }

  // Toggle a quick-pick
  function togglePick(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Ensure or create a customer
  async function ensureCustomer(): Promise<Customer> {
    if (customerId) {
      const { data } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (data) return data;
    }

    // try match by phone, otherwise email
    const query = supabase.from("customers").select("*").limit(1);
    if (custPhone) query.ilike("phone", custPhone);
    else if (custEmail) query.ilike("email", custEmail);
    const { data: found } = await query;
    if (found?.[0]) {
      setCustomerId(found[0].id);
      return found[0];
    }

    const toInsert = {
      first_name: custFirst || null,
      last_name:  custLast  || null,
      phone:      custPhone || null,
      email:      custEmail || null,
    };
    const { data: inserted, error: insErr } = await supabase.from("customers").insert(toInsert).select("*").single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create customer");
    setCustomerId(inserted.id);
    return inserted;
  }

  // Ensure or create a vehicle for that customer
  async function ensureVehicle(cust: Customer, shopId: string): Promise<Vehicle> {
    if (vehicleId) {
      const { data } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
      if (data) return data;
    }

    let existing: Vehicle | null = null;
    if (vin || plate) {
      const { data: maybe } = await supabase
        .from("vehicles")
        .select("*")
        .eq("customer_id", cust.id)
        .or([vin ? `vin.eq.${vin}` : "", plate ? `license_plate.eq.${plate}` : ""].filter(Boolean).join(","));
      existing = maybe?.[0] ?? null;
    }
    if (existing) {
      setVehicleId(existing.id);
      return existing;
    }

    const toInsert = {
      customer_id:   cust.id,
      vin:           vin || null,
      year:          year ? Number(year) : null,
      make:          make || null,
      model:         model || null,
      license_plate: plate || null,
      mileage:       mileage ? Number(mileage) : null,
      shop_id:       shopId,
    };
    const { data: inserted, error: insErr } = await supabase.from("vehicles").insert(toInsert).select("*").single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create vehicle");
    setVehicleId(inserted.id);
    return inserted;
  }

  async function uploadVehicleFiles(vId: string): Promise<UploadSummary> {
    let uploaded = 0, failed = 0;
    const { data: { user } } = await supabase.auth.getUser();
    const uploader = user?.id ?? null;

    const uploadOne = async (bucket: "vehicle-photos" | "vehicle-docs", f: File, mediaType: "photo" | "document") => {
      const key = `veh_${vId}/${Date.now()}_${f.name}`;
      const up = await supabase.storage.from(bucket).upload(key, f, { upsert: false });
      if (up.error) { failed += 1; return; }
      const { error: rowErr } = await supabase.from("vehicle_media").insert({
        vehicle_id: vId, type: mediaType, storage_path: key, uploaded_by: uploader,
      });
      if (rowErr) failed += 1; else uploaded += 1;
    };

    for (const f of photoFiles) await uploadOne("vehicle-photos", f, "photo");
    for (const f of docFiles)   await uploadOne("vehicle-docs",   f, "document");
    return { uploaded, failed };
  }

  // ========== effects
  // absorb URL prefill
  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    const i = searchParams.get("inspectionId");
    if (v) setPrefillVehicleId(v);
    if (c) setPrefillCustomerId(c);
    if (i) setInspectionId(i);
  }, [searchParams, setPrefillVehicleId, setPrefillCustomerId, setInspectionId]);

  // prefill customer / vehicle + load menu
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (prefillCustomerId) {
        const { data } = await supabase.from("customers").select("*").eq("id", prefillCustomerId).maybeSingle();
        if (!cancelled && data) {
          setCustomerId(data.id);
          setCustFirst(data.first_name ?? "");
          setCustLast(data.last_name ?? "");
          setCustPhone(data.phone ?? "");
          setCustEmail(data.email ?? "");
        }
      }
      if (prefillVehicleId) {
        const { data } = await supabase.from("vehicles").select("*").eq("id", prefillVehicleId).maybeSingle();
        if (!cancelled && data) {
          setVehicleId(data.id);
          setVin(data.vin ?? "");
          setYear(data.year ? String(data.year) : "");
          setMake(data.make ?? "");
          setModel(data.model ?? "");
          setPlate(data.license_plate ?? "");
          setMileage(data.mileage ? String(data.mileage) : "");
        }
      }

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const { data: items } = await supabase
        .from("menu_items")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (!cancelled) setMenuItems(items ?? []);

      const channel = supabase
        .channel("menu-items-create-quickpick")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "menu_items", filter: `user_id=eq.${uid}` },
          async () => {
            const { data: refetch } = await supabase
              .from("menu_items")
              .select("*")
              .eq("user_id", uid)
              .order("created_at", { ascending: false });
            if (!cancelled) setMenuItems(refetch ?? []);
          },
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    })();
    return () => { cancelled = true; };
  }, [prefillCustomerId, prefillVehicleId, supabase, setMenuItems,
      setCustomerId, setCustFirst, setCustLast, setCustPhone, setCustEmail,
      setVehicleId, setVin, setYear, setMake, setModel, setPlate, setMileage]);

  // ========== submit
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(""); setInviteNotice(""); setUploadSummary(null);

    try {
      if (!custFirst && !custPhone && !custEmail) {
        throw new Error("Please enter at least a name, phone, or email for the customer.");
      }

      const customer = await ensureCustomer();
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user?.id) throw new Error("Not signed in.");

      const { data: profileNames } = await supabase
        .from("profiles")
        .select("first_name, last_name, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      const vehicle = await ensureVehicle(customer, shopId);

      const initials = getInitials(
        profileNames?.first_name,
        profileNames?.last_name,
        profileNames?.full_name ?? user.email ?? null,
      );
      const customId = await generateCustomId(initials);

      const newId = uuidv4();
      const { error: woErr } = await supabase.from("work_orders").insert({
        id: newId,
        custom_id: customId,
        vehicle_id: vehicle.id,
        customer_id: customer.id,
        inspection_id: inspectionId,
        notes,
        user_id: user.id,
        shop_id: shopId,
        status: "awaiting_approval",
      });
      if (woErr) throw new Error(woErr.message || "Failed to create work order.");

      // seed lines from selected menu items
      if (selectedIds.length > 0) {
        const selected = menuItems.filter((m) => selectedIds.includes(m.id));
        if (selected.length) {
          const lineRows = selected.map((m) => ({
            work_order_id: newId,
            vehicle_id:    vehicle.id,
            user_id:       user.id,
            description:   m.name ?? null,
            labor_time:    m.labor_time ?? null,
            complaint:     m.complaint ?? null,
            cause:         m.cause ?? null,
            correction:    m.correction ?? null,
            tools:         m.tools ?? null,
            status:        "awaiting" as const,
            job_type:      type,
          }));
          const { error: lineErr } = await supabase.from("work_order_lines").insert(lineRows);
          if (lineErr) console.error("Failed to add menu items as lines:", lineErr);
        }
      }

      // optional: import from inspection
      if (inspectionId) {
        try {
          const res = await fetch("/api/work-orders/import-from-inspection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workOrderId: newId, inspectionId, vehicleId: vehicle.id }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            console.error("Import from inspection failed:", j?.error || res.statusText);
          }
        } catch (err) {
          console.error("Import from inspection errored:", err);
        }
      }

      // uploads (optional)
      if (photoFiles.length || docFiles.length) {
        const summary = await uploadVehicleFiles(vehicle.id);
        setUploadSummary(summary);
      }

      // optional: email customer portal invite
      if (sendInvite && custEmail) {
        try {
          const origin =
            typeof window !== "undefined"
              ? window.location.origin
              : (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
          const portalUrl = `${origin || "https://profixiq.com"}/portal/signup?email=${encodeURIComponent(custEmail)}`;
          const { error: fnErr } = await supabase.functions.invoke("send-portal-invite", {
            body: { email: custEmail, customer_id: customer.id, portal_url: portalUrl } as any,
          });
          if (fnErr) setInviteNotice("Work order created. Failed to send invite email (logged).");
          else       setInviteNotice("Work order created. Invite email queued to the customer.");
        } catch (e) {
          console.warn("send-portal-invite threw:", e);
          setInviteNotice("Work order created. Failed to send invite email (caught).");
        }
      }

      // go straight to TECH page for this WO
      router.push(`/work-orders/${newId}`);
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "Failed to create work order.";
      setError(message);
      setLoading(false);
    }
  }

  // ========== UI
  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <h1 className="mb-6 text-2xl font-bold">Create Work Order</h1>

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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_360px]">
          {/* LEFT: Form */}
          <div className="space-y-6 rounded border border-orange-400 bg-neutral-900 p-4">
            {/* Customer */}
            <section>
              <h2 className="mb-2 text-lg font-semibold">Customer</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm">First name</label>
                  <input
                    value={custFirst}
                    onChange={(e) => setCustFirst(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="Jane"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Last name</label>
                  <input
                    value={custLast}
                    onChange={(e) => setCustLast(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="Doe"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Phone</label>
                  <input
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="(555) 555-5555"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Email</label>
                  <input
                    type="email"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="jane@example.com"
                    disabled={loading}
                  />
                  <div className="mt-1 flex items-center gap-2 text-xs text-neutral-300">
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
                </div>
              </div>
            </section>

            {/* Vehicle */}
            <section>
              <h2 className="mb-2 text-lg font-semibold">Vehicle</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm">VIN</label>
                  <input
                    value={vin}
                    onChange={(e) => setVin(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="1HGBH41JXMN109186"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Year</label>
                  <input
                    inputMode="numeric"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="2018"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Make</label>
                  <input
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="Toyota"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Model</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="Camry"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Plate</label>
                  <input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="ABC-123"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Mileage</label>
                  <input
                    inputMode="numeric"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    placeholder="123456"
                    disabled={loading}
                  />
                </div>
              </div>
            </section>

            {/* Optional: import from inspection */}
            <section>
              <h2 className="mb-2 text-lg font-semibold">Optional: Import from Inspection</h2>
              <div className="flex gap-2">
                <input
                  value={inspectionId ?? ""}
                  onChange={(e) => setInspectionId(e.target.value || null)}
                  className="flex-1 rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                  placeholder="Paste inspection ID (optional)"
                  disabled={loading}
                />
                {inspectionId && (
                  <button
                    type="button"
                    className="rounded border border-neutral-600 px-3 py-2 text-sm"
                    onClick={() => setInspectionId(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
            </section>

            {/* Work Order defaults for quick-add */}
            <section>
              <h2 className="mb-2 text-lg font-semibold">Work Order</h2>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm">Default job type for added menu items</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as WOType)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    disabled={loading}
                  >
                    <option value="maintenance">Maintenance</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="inspection">Inspection</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    rows={3}
                    placeholder="Optional notes for technician"
                    disabled={loading}
                  />
                </div>
              </div>
            </section>

            {/* Uploads */}
            <section>
              <h2 className="mb-2 text-lg font-semibold">Uploads</h2>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm">Vehicle Photos</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm">Documents (PDF/JPG/PNG)</label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    onChange={(e) => setDocFiles(Array.from(e.target.files ?? []))}
                    className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
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
                className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
              >
                {loading ? "Creating..." : "Create Work Order"}
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

          {/* RIGHT: Quick Add from Service Menu */}
          <aside className="rounded border border-orange-400 bg-neutral-900 p-4">
            <h2 className="mb-3 text-lg font-semibold text-orange-400">Service Menu</h2>
            {menuItems.length === 0 ? (
              <p className="text-sm text-neutral-400">No saved items yet. Add some in /menu.</p>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {menuItems.map((m) => {
                  const picked = selectedIds.includes(m.id);
                  return (
                    <li key={m.id} className="flex items-center justify-between py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{m.name}</div>
                        <div className="truncate text-xs text-neutral-400">
                          {typeof m.labor_time === "number" ? `${m.labor_time}h` : "—"}
                          {m.tools ? ` • Tools: ${m.tools}` : ""}
                          {m.complaint ? ` • Complaint: ${m.complaint}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => togglePick(m.id)}
                        className={`ml-3 rounded px-3 py-1 text-sm ${
                          picked ? "bg-neutral-700 text-white" : "bg-orange-600 text-black hover:bg-orange-700"
                        }`}
                      >
                        {picked ? "Remove" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedIds.length > 0 && (
              <div className="mt-3 text-xs text-neutral-300">
                <strong>Selected:</strong>{" "}
                {menuItems
                  .filter((m) => selectedIds.includes(m.id))
                  .map((s) => s.name)
                  .join(", ")}
              </div>
            )}
          </aside>
        </div>
      </form>
    </div>
  );
}