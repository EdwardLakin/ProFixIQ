"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { toast } from "sonner";

import { useTabState } from "@/features/shared/hooks/useTabState";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

// line add-ons on the Create page
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";

type DB = Database;
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];
type VehicleRow  = DB["public"]["Tables"]["vehicles"]["Row"];
type LineRow     = DB["public"]["Tables"]["work_order_lines"]["Row"];

type WOType = "inspection" | "maintenance" | "diagnosis";

type UploadSummary = {
  uploaded: number;
  failed: number;
};

/* --------------------------------- page ---------------------------------- */

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // from URL (optional: continue editing an existing draft)
  const paramWoId = searchParams.get("woId");
  const [woId, setWoId] = useTabState<string | null>("create.woId", paramWoId ?? null);

  // --- Preselects (optional) -------------------------------------------------
  const [prefillVehicleId, setPrefillVehicleId] = useTabState<string | null>("create.prefillVehicleId", null);
  const [prefillCustomerId, setPrefillCustomerId] = useTabState<string | null>("create.prefillCustomerId", null);
  const [inspectionId, setInspectionId] = useTabState<string | null>("create.inspectionId", null);

  // --- Customer form ---------------------------------------------------------
  const [customerId, setCustomerId] = useTabState<string | null>("create.customerId", null);
  const [custFirst, setCustFirst] = useTabState("create.custFirst", "");
  const [custLast, setCustLast]   = useTabState("create.custLast", "");
  const [custPhone, setCustPhone] = useTabState("create.custPhone", "");
  const [custEmail, setCustEmail] = useTabState("create.custEmail", "");
  const [sendInvite, setSendInvite] = useTabState<boolean>("create.sendInvite", false);

  // --- Vehicle form ----------------------------------------------------------
  const [vehicleId, setVehicleId] = useTabState<string | null>("create.vehicleId", null);
  const [vin, setVin]       = useTabState("create.vin", "");
  const [year, setYear]     = useTabState<string>("create.year", "");
  const [make, setMake]     = useTabState("create.make", "");
  const [model, setModel]   = useTabState("create.model", "");
  const [plate, setPlate]   = useTabState("create.plate", "");
  const [mileage, setMileage] = useTabState<string>("create.mileage", "");

  // --- WO basics -------------------------------------------------------------
  const [type, setType]   = useTabState<WOType>("create.type", "maintenance"); // default job_type seed for menu
  const [notes, setNotes] = useTabState("create.notes", "");

  // --- Uploads ---------------------------------------------------------------
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [docFiles, setDocFiles]     = useState<File[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);

  // lines (for preview list on the create page)
  const [lines, setLines] = useState<LineRow[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // --- UI state --------------------------------------------------------------
  const [loading,] = useTabState("create.loading", false);
  const [error, setError]     = useTabState("create.error", "");
  const [inviteNotice, setInviteNotice] = useTabState<string>("create.inviteNotice", "");
  const [jobsEnabled, setJobsEnabled]   = useTabState<boolean>("create.jobsEnabled", !!woId);

  const [busyEnable, setBusyEnable] = useState(false);

  /* ----------------------------- read params ------------------------------ */

  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    const i = searchParams.get("inspectionId");
    if (v) setPrefillVehicleId(v);
    if (c) setPrefillCustomerId(c);
    if (i) setInspectionId(i);
  }, [searchParams, setPrefillVehicleId, setPrefillCustomerId, setInspectionId]);

  /* ----------------------------- prefill data ----------------------------- */

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
    })();
    return () => { cancelled = true; };
  }, [prefillCustomerId, prefillVehicleId, supabase,
      setCustomerId, setCustFirst, setCustLast, setCustPhone, setCustEmail,
      setVehicleId, setVin, setYear, setMake, setModel, setPlate, setMileage]);

  /* --------------------------- shop + identity ---------------------------- */

  async function getOrLinkShopId(userId: string): Promise<string | null> {
    const { data: profile, error: profErr } = await supabase
      .from("profiles").select("id, shop_id").eq("id", userId).maybeSingle();
    if (profErr) throw profErr;
    if (profile?.shop_id) return profile.shop_id;

    const { data: owned, error: shopErr } = await supabase
      .from("shops").select("id").eq("owner_id", userId).maybeSingle();
    if (shopErr) throw shopErr;
    if (!owned?.id) return null;

    const { error: updErr } = await supabase.from("profiles").update({ shop_id: owned.id }).eq("id", userId);
    if (updErr) throw updErr;
    return owned.id;
  }

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
      .from("work_orders").select("custom_id")
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

  /* --------------------------- ensure entities ---------------------------- */

  async function ensureCustomer(): Promise<CustomerRow> {
    if (customerId) {
      const { data } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
      if (data) return data;
    }

    if (custPhone || custEmail) {
      const query = supabase.from("customers").select("*").limit(1);
      if (custPhone) query.ilike("phone", custPhone);
      else if (custEmail) query.ilike("email", custEmail);
      const { data: found } = await query;
      if (found && found.length > 0) {
        setCustomerId(found[0].id);
        return found[0];
      }
    }

    const toInsert = {
      first_name: custFirst || null,
      last_name : custLast || null,
      phone     : custPhone || null,
      email     : custEmail || null,
    };
    const { data: inserted, error: insErr } =
      await supabase.from("customers").insert(toInsert).select("*").single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create customer");
    setCustomerId(inserted.id);
    return inserted;
  }

  async function ensureVehicle(cust: CustomerRow, shopId: string | null): Promise<VehicleRow> {
    if (vehicleId) {
      const { data } = await supabase.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
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
      shop_id: shopId,
    };
    const { data: inserted, error: insErr } =
      await supabase.from("vehicles").insert(toInsert).select("*").single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create vehicle");
    setVehicleId(inserted.id);
    return inserted;
  }

  async function uploadVehicleFiles(vId: string): Promise<UploadSummary> {
    let uploaded = 0;
    let failed = 0;

    const { data: { user } } = await supabase.auth.getUser();
    const uploader = user?.id ?? null;

    const uploadAndRecord = async (
      bucket: "vehicle-photos" | "vehicle-docs",
      f: File,
      mediaType: "photo" | "document",
    ): Promise<void> => {
      const key = `veh_${vId}/${Date.now()}_${f.name}`;
      const up = await supabase.storage.from(bucket).upload(key, f, { upsert: false });
      if (up.error) { failed += 1; return; }
      const { error: rowErr } = await supabase.from("vehicle_media").insert({
        vehicle_id: vId,
        type: mediaType,
        storage_path: key,
        uploaded_by: uploader,
      });
      if (rowErr) failed += 1; else uploaded += 1;
    };

    for (const f of photoFiles) await uploadAndRecord("vehicle-photos", f, "photo");
    for (const f of docFiles) await uploadAndRecord("vehicle-docs", f, "document");

    return { uploaded, failed };
  }

  /* ------------------------- draft creation / enable ----------------------- */

  const enableJobs = useCallback(async () => {
    if (busyEnable) return;
    setBusyEnable(true);
    setError("");

    try {
      // must have at least some customer info
      if (!custFirst && !custPhone && !custEmail) {
        throw new Error("Enter at least a name, phone, or email for the customer.");
      }

      // get current user + names (for initials) + shop
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Not signed in.");
      const { data: profileNames } = await supabase
        .from("profiles")
        .select("first_name, last_name, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const shopId = await getOrLinkShopId(user.id);
      if (!shopId) throw new Error("Your profile isn’t linked to a shop yet.");

      // ensure customer & vehicle
      const cust = await ensureCustomer();
      const veh  = await ensureVehicle(cust, shopId);

      // create the WO only if we don't have one
      let id = woId;
      if (!id) {
        const initials  = getInitials(profileNames?.first_name, profileNames?.last_name, profileNames?.full_name ?? user.email ?? null);
        const customId  = await generateCustomId(initials);
        id = uuidv4();

        const { error: insertWOError } = await supabase.from("work_orders").insert({
          id,
          custom_id   : customId,
          vehicle_id  : veh.id,
          customer_id : cust.id,
          inspection_id: inspectionId,
          notes,
          user_id: user.id,
          shop_id: shopId,
          status: "awaiting_approval", // advisor building the quote
        });
        if (insertWOError) throw new Error(insertWOError.message || "Failed to create work order.");
        setWoId(id);
        setJobsEnabled(true);

        // uploads (optional)
        if (photoFiles.length || docFiles.length) {
          const summary = await uploadVehicleFiles(veh.id);
          setUploadSummary(summary);
        }

        // optional customer portal invite
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
      } else {
        setJobsEnabled(true);
      }

      toast.success("Jobs enabled — add job lines now.");
      await fetchLines(id!);
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "Failed to enable job adding.";
      setError(message);
    } finally {
      setBusyEnable(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busyEnable, custFirst, custPhone, custEmail, supabase, woId, inspectionId, notes,
      photoFiles, docFiles, sendInvite, custEmail]);

  /* -------------------------- fetch lines (preview) ------------------------ */

  const fetchLines = useCallback(async (id: string) => {
    setLinesLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setLines(data ?? []);
    } catch (e) {
      console.error("fetchLines error:", e);
    } finally {
      setLinesLoading(false);
    }
  }, [supabase]);

  // keep lines fresh once a draft exists
  useEffect(() => {
    if (!woId) return;
    void fetchLines(woId);
    const ch = supabase
      .channel(`create-wo:${woId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines", filter: `work_order_id=eq.${woId}` },
        () => fetchLines(woId)
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [woId, fetchLines, supabase]);

  /* ----------------------------- finish flow ------------------------------ */

  const goReview = async () => {
    if (!woId) {
      toast.error("Enable jobs (creates the draft) before reviewing.");
      return;
    }
    router.push(`/work-orders/quote-review?woId=${woId}`);
  };

  /* --------------------------------- UI ----------------------------------- */

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <PreviousPageButton to="/work-orders" />
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        {/* LEFT: main form + jobs */}
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

          {/* Optional: Import from inspection */}
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

          {/* Work Order (type select is only a default for menu) */}
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

          {/* Enable jobs / Done */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!jobsEnabled ? (
              <button
                type="button"
                onClick={enableJobs}
                disabled={busyEnable}
                className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
              >
                {busyEnable ? "Creating draft…" : "Enable Jobs"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={goReview}
                  className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600"
                >
                  Done → Review & Sign
                </button>
                <span className="text-xs text-neutral-400">
                  Draft ID: <code className="text-neutral-200">{woId}</code>
                </span>
              </>
            )}

            <button
              type="button"
              onClick={() => router.push("/work-orders")}
              className="text-sm text-neutral-400 hover:underline"
              disabled={loading}
            >
              Cancel
            </button>
          </div>

          {/* JOBS pane (enabled only after a draft WO exists) */}
          <section className={`mt-6 ${jobsEnabled ? "" : "opacity-50 pointer-events-none select-none"}`}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Jobs</h2>
              {!jobsEnabled && <span className="text-xs text-neutral-400">Click “Enable Jobs” to begin</span>}
            </div>

            {jobsEnabled && woId && (
              <div className="space-y-4">
                {/* Quick Add menu */}
                <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                  <MenuQuickAdd workOrderId={woId} />
                </div>

                {/* Manual add form */}
                <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                  <NewWorkOrderLineForm
                    workOrderId={woId}
                    vehicleId={vehicleId ?? null}
                    defaultJobType={type}
                    onCreated={() => fetchLines(woId)}
                  />
                </div>

                {/* Current lines preview */}
                <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">Current Lines</h3>
                    {linesLoading && <span className="text-xs text-neutral-400">Refreshing…</span>}
                  </div>

                  {lines.length === 0 ? (
                    <p className="text-sm text-neutral-400">No lines yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {lines.map((ln) => (
                        <li key={ln.id} className="rounded border border-neutral-800 bg-neutral-950 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {ln.description || ln.complaint || "Untitled job"}
                              </div>
                              <div className="text-xs text-neutral-400">
                                {(ln.job_type ?? "job").toString().replaceAll("_", " ")} •{" "}
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
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT: brief tips / totals */}
        <aside className="rounded border border-orange-400 bg-neutral-900 p-4 space-y-4">
          <h2 className="text-lg font-semibold text-orange-400">Summary</h2>

          <div className="text-sm text-neutral-300 space-y-1">
            <div>Customer: <span className="text-neutral-200">
              {[custFirst, custLast].filter(Boolean).join(" ") || (custEmail || custPhone || "—")}
            </span></div>
            <div>Vehicle: <span className="text-neutral-200">
              {[year, make, model].filter(Boolean).join(" ") || (vin || "—")}
            </span></div>
            <div>Lines: <span className="text-neutral-200">{lines.length}</span></div>
          </div>

          {lines.length > 0 && (
            <div className="text-xs text-neutral-400">
              Totals are shown on the Review screen. Labor rate and parts are applied there.
            </div>
          )}

          {woId && (
            <div className="pt-2">
              <button
                type="button"
                onClick={goReview}
                className="w-full rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600"
              >
                Done → Review & Sign
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}