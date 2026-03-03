// app/customers/[id]/page.tsx (FULL FILE REPLACEMENT)
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

type DB = Database;

type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleMedia = DB["public"]["Tables"]["vehicle_media"]["Row"];

type CustomerSearchRow = Pick<
  Customer,
  "id" | "first_name" | "last_name" | "email" | "phone" | "phone_number" | "created_at"
>;

type ParamsShape = Record<string, string | string[]>;
function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const looksLikeUuid = (s: string | null): boolean =>
  !!s && s.includes("-") && s.length >= 36;

const CARD_BASE =
  "rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl";
const CARD_INNER = "rounded-xl border border-slate-700/60 bg-slate-950/60";

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
  return [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ") || "—";
}

function fmtVehicleLabel(v: Vehicle): string {
  const ym = [v.year != null ? String(v.year) : "", v.make ?? "", v.model ?? ""]
    .filter(Boolean)
    .join(" ");
  const plate = v.license_plate ? ` • ${v.license_plate}` : "";
  return `${ym || "Vehicle"}${plate}`;
}

function safeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "PPpp");
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
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/60 bg-black/40 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="min-w-0 truncate text-sm font-medium text-white">
        {value ?? "—"}
      </div>
    </div>
  );
}

/** Storage buckets (from your Supabase screenshot) */
const BUCKET_PHOTOS_PRIMARY = "vehicle-photos";
const BUCKET_DOCS_PRIMARY = "vehicle-docs";

/** Legacy fallbacks (in case older code used underscores) */
const BUCKET_PHOTOS_LEGACY = "vehicle_photos";
const BUCKET_DOCS_LEGACY = "vehicle_docs";

function bucketCandidates(kind: "photo" | "document"): string[] {
  if (kind === "photo") return [BUCKET_PHOTOS_PRIMARY, BUCKET_PHOTOS_LEGACY];
  return [BUCKET_DOCS_PRIMARY, BUCKET_DOCS_LEGACY];
}

export default function CustomerProfilePage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const rawId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const isDirectoryMode = useMemo(() => {
    const v = (rawId ?? "").toLowerCase();
    return v === "search" || v === "all" || v === "directory";
  }, [rawId]);

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
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);

  const [vehicleMedia, setVehicleMedia] = useState<VehicleMedia[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);

  // Search / directory mode
  const [query, setQuery] = useState<string>("");
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<CustomerSearchRow[]>([]);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  const historySlice = useMemo(() => {
    if (showAllHistory) return workOrders;
    return workOrders.slice(0, 3);
  }, [showAllHistory, workOrders]);

  // ------------------ Fetch customer file ------------------
  const fetchCustomerFile = useCallback(
    async (customerId: string) => {
      setLoading(true);
      setViewError(null);

      try {
        const { data: cust, error: custErr } = await supabase
          .from("customers")
          .select("*")
          .eq("id", customerId)
          .maybeSingle();

        if (custErr) throw custErr;

        if (!cust) {
          setCustomer(null);
          setVehicles([]);
          setSelectedVehicleId(null);
          setWorkOrders([]);
          setVehicleMedia([]);
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

        const vrows = (vs ?? []) as Vehicle[];
        setVehicles(vrows);

        // Keep current selection if still valid; otherwise default to first
        setSelectedVehicleId((prev) => {
          if (prev && vrows.some((v) => v.id === prev)) return prev;
          return vrows[0]?.id ?? null;
        });

        const { data: wos, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false });

        if (woErr) throw woErr;
        setWorkOrders((wos ?? []) as WorkOrder[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load customer file.";
        setViewError(msg);
        setCustomer(null);
        setVehicles([]);
        setSelectedVehicleId(null);
        setWorkOrders([]);
        setVehicleMedia([]);
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  // Initial load (only if we have an actual customer id)
  useEffect(() => {
    if (!effectiveCustomerId) {
      setLoading(false);
      return;
    }
    void fetchCustomerFile(effectiveCustomerId);
  }, [effectiveCustomerId, fetchCustomerFile]);

  // ------------------ Fetch media for selected vehicle ------------------
  const fetchMedia = useCallback(
    async (vehicleId: string) => {
      try {
        const { data: media, error } = await supabase
          .from("vehicle_media")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .order("created_at", { ascending: false });

        if (error) {
          setVehicleMedia([]);
          return;
        }
        setVehicleMedia((media ?? []) as VehicleMedia[]);
      } catch {
        setVehicleMedia([]);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!selectedVehicleId) {
      setVehicleMedia([]);
      return;
    }
    void fetchMedia(selectedVehicleId);
  }, [selectedVehicleId, fetchMedia]);

  // ------------------ Directory search ------------------
  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const like = `%${q.replaceAll("%", "").replaceAll("_", "")}%`;

      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone, phone_number, created_at")
        .or(
          [
            `first_name.ilike.${like}`,
            `last_name.ilike.${like}`,
            `email.ilike.${like}`,
            `phone.ilike.${like}`,
            `phone_number.ilike.${like}`,
          ].join(","),
        )
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        setResults([]);
        return;
      }

      setResults((data ?? []) as CustomerSearchRow[]);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, supabase]);

  useEffect(() => {
    if (!isDirectoryMode && !sp.get("mode")) return;
    // optional: prime query from ?q=
    const q = sp.get("q");
    if (q && !query) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirectoryMode]);

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

          // If bucket exists but policy blocks, no point retrying bucket name.
          // But if bucket name is wrong/missing, the fallback helps.
          // We just try both and move on.
        }

        if (!uploadedBucket) {
          setViewError(lastErrMsg ?? "Upload failed.");
          return;
        }

        const { data: pub } = supabase.storage
          .from(uploadedBucket)
          .getPublicUrl(storagePath);

        const publicUrl = pub?.publicUrl ?? null;

        // IMPORTANT:
        // Your generated types indicate `vehicle_media` does NOT have `storage_bucket`,
        // so we only insert known-safe fields.
        const insertRow = {
          vehicle_id: selectedVehicleId,
          url: publicUrl,
          type: kind,
          filename: file.name,
          storage_path: storagePath,
        } satisfies DB["public"]["Tables"]["vehicle_media"]["Insert"];

        const { error: insErr } = await supabase.from("vehicle_media").insert(insertRow);
        if (insErr) {
          setViewError(insErr.message);
          return;
        }

        await fetchMedia(selectedVehicleId);
      } finally {
        if (isPhoto) setUploadingPhoto(false);
        else setUploadingDoc(false);
      }
    },
    [fetchMedia, selectedVehicleId, supabase],
  );

  // ------------------ UI ------------------
  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16">
      {children}
    </div>
  );

  // DIRECTORY MODE (tile-friendly)
  if (isDirectoryMode || sp.get("mode") === "search") {
    return (
      <PageShell>
        <div className="mb-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-200 hover:bg-black/55 hover:text-white"
          >
            <span aria-hidden className="text-base leading-none">
              ←
            </span>
            Back
          </button>

          <div className="text-[10px] text-slate-500">Customers</div>
        </div>

        <div className={`${CARD_BASE} p-4`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className="text-2xl font-semibold text-white"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                Customer Files
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Search by name, email, or phone. Open a customer to view the full file.
              </p>
            </div>

            <div className="flex w-full gap-2 sm:w-[520px]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers…"
                className="w-full rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110 disabled:opacity-60"
                disabled={searching}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            {query.trim().length === 0 ? (
              <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>
                Start typing to search customers.
              </div>
            ) : results.length === 0 ? (
              <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>
                {searching ? "Searching…" : "No matches yet."}
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => {
                  const phone =
                    r.phone ?? r.phone_number ?? null;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => router.push(`/customers/${r.id}`)}
                      className={`${CARD_INNER} w-full p-3 text-left hover:border-[rgba(184,115,51,0.65)]`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {fmtName(r)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {r.email ?? "—"}
                            {phone ? (
                              <>
                                <span className="mx-2 text-slate-600">•</span>
                                {phone}
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500">
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
      </PageShell>
    );
  }

  // If they navigated to /customers/<something> that isn't a UUID,
  // treat it like a search landing (so it still "works" without needing a new route).
  if (!effectiveCustomerId) {
    return (
      <PageShell>
        <div className={`${CARD_BASE} p-4`}>
          <div className="text-sm text-slate-200">
            This route expects a customer id.
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Use <span className="font-mono text-slate-200">/customers/search</span> to open the customer directory.
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black"
              onClick={() => router.push("/customers/search")}
            >
              Open Customer Directory
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // CUSTOMER FILE MODE
  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-200 hover:bg-black/55 hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          Back
        </button>

        <div className="text-[10px] text-slate-500">Customer File</div>
      </div>

      {viewError && (
        <div className="mb-4 whitespace-pre-wrap rounded-2xl border border-red-500/35 bg-red-950/50 p-3 text-sm text-red-200 shadow-[0_18px_45px_rgba(0,0,0,0.75)]">
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
        <div className={`${CARD_BASE} p-4 text-sm text-red-300`}>Customer not found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Header */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1
                    className="truncate text-2xl font-semibold text-white sm:text-3xl"
                    style={{ fontFamily: "var(--font-blackops), system-ui" }}
                  >
                    {fmtName(customer)}
                  </h1>

                  <div className="mt-2 text-sm text-slate-300">
                    {customer.email ?? "—"}
                    {(customer.phone ?? customer.phone_number) ? (
                      <>
                        <span className="mx-2 text-slate-600">•</span>
                        {customer.phone ?? customer.phone_number}
                      </>
                    ) : null}
                  </div>

                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    <div>{customer.address ?? "—"}</div>
                    <div>
                      {[customer.city, customer.province, customer.postal_code]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/work-orders/create?customerId=${customer.id}${
                        selectedVehicleId ? `&vehicleId=${selectedVehicleId}` : ""
                      }`,
                    )
                  }
                  className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
                >
                  Create Work Order
                </button>
              </div>
            </div>

            {/* Vehicles */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white sm:text-base">
                    Vehicles
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Select a vehicle to view details and files.
                  </p>
                </div>

                {vehicles.length > 0 ? (
                  <select
                    value={selectedVehicleId ?? ""}
                    onChange={(e) => setSelectedVehicleId(e.target.value || null)}
                    className="rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {fmtVehicleLabel(v)}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>

              {vehicles.length === 0 ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>
                  No vehicles linked to this customer yet.
                </div>
              ) : selectedVehicle ? (
                <div className="mt-3 space-y-3">
                  <div className={`${CARD_INNER} p-3`}>
                    <div className="text-sm font-semibold text-white">
                      {fmtVehicleLabel(selectedVehicle)}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <DetailRow label="VIN" value={selectedVehicle.vin} />
                      <DetailRow label="License Plate" value={selectedVehicle.license_plate} />
                      <DetailRow label="Mileage" value={selectedVehicle.mileage} />
                      <DetailRow label="Unit #" value={selectedVehicle.unit_number} />
                      <DetailRow label="Color" value={selectedVehicle.color} />
                      <DetailRow
                        label="Engine Hours"
                        value={
                          typeof selectedVehicle.engine_hours === "number"
                            ? selectedVehicle.engine_hours
                            : selectedVehicle.engine_hours ?? null
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* History */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white sm:text-base">
                    Work Order History
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Showing {showAllHistory ? "all" : "latest 3"} work orders for this customer.
                  </p>
                </div>

                {workOrders.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((v) => !v)}
                    className="text-[11px] font-semibold text-[rgba(184,115,51,0.95)] hover:underline"
                  >
                    {showAllHistory ? "Show less" : "Show all"}
                  </button>
                ) : null}
              </div>

              {workOrders.length === 0 ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>
                  No work orders yet.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {historySlice.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      onClick={() => router.push(`/work-orders/${wo.id}`)}
                      className={`${CARD_INNER} w-full p-3 text-left hover:border-[rgba(184,115,51,0.65)]`}
                      title="Open work order"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {wo.custom_id ? `WO ${wo.custom_id}` : `WO #${wo.id.slice(0, 8)}`}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {safeDate(wo.created_at)}
                          </div>
                        </div>

                        <span className={chipClass(wo.status)}>
                          {(wo.status ?? "awaiting").replaceAll("_", " ")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <aside className="space-y-6">
            <div className={`${CARD_BASE} p-4`}>
              <h3 className="text-sm font-semibold text-white">Upload Vehicle Photos</h3>
              <p className="mt-1 text-[11px] text-slate-400">
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
                  className="w-full text-sm text-slate-200"
                />
                {uploadingPhoto && (
                  <div className="mt-2 text-[11px] text-slate-400">Uploading photo…</div>
                )}
              </div>
            </div>

            <div className={`${CARD_BASE} p-4`}>
              <h3 className="text-sm font-semibold text-white">Upload Documents</h3>
              <p className="mt-1 text-[11px] text-slate-400">
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
                  className="w-full text-sm text-slate-200"
                />
                {uploadingDoc && (
                  <div className="mt-2 text-[11px] text-slate-400">Uploading document…</div>
                )}
              </div>
            </div>

            <div className={`${CARD_BASE} p-4`}>
              <h3 className="text-sm font-semibold text-white">Vehicle Gallery & Files</h3>
              <p className="mt-1 text-[11px] text-slate-400">
                Files shown for the selected vehicle.
              </p>

              {!selectedVehicleId ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>
                  Select a vehicle to view files.
                </div>
              ) : vehicleMedia.length === 0 ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>
                  No files uploaded yet.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {vehicleMedia.map((m) => {
                    const url = m.url ?? null;
                    const img = isImageUrl(url) || (m.type ?? "") === "photo";
                    const title = m.filename ?? (m.type ?? "file");

                    return (
                      <a
                        key={m.id}
                        href={url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-xl border border-slate-700/60 bg-black/40 hover:border-[rgba(184,115,51,0.65)]"
                        title={title}
                      >
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url ?? ""}
                            alt={title}
                            className="h-28 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-28 w-full items-center justify-center px-2 text-center text-[11px] text-slate-300">
                            View document
                          </div>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </PageShell>
  );
}