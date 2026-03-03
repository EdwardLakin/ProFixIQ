// app/customers/[id]/page.tsx (FULL FILE REPLACEMENT)
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  | "id"
  | "first_name"
  | "last_name"
  | "name"
  | "business_name"
  | "email"
  | "phone"
  | "phone_number"
  | "created_at"
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
  return (
    [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ") || "—"
  );
}

function fmtVehicleLabel(v: Vehicle): string {
  const ym = [v.year != null ? String(v.year) : "", v.make ?? "", v.model ?? ""]
    .filter(Boolean)
    .join(" ");
  const plate = (v as unknown as Record<string, unknown>)["license_plate"]
    ? ` • ${(v as unknown as Record<string, unknown>)["license_plate"] as string}`
    : v.license_plate
      ? ` • ${v.license_plate}`
      : "";
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

function asText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.trim().length ? v : "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "—";
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(2,6,23,0.98))] shadow-[0_28px_90px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700/60 bg-black/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 hover:bg-black/55"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-800/60 px-4 py-3">
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
        className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-slate-200 hover:bg-black/55 hover:text-white"
      >
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        Back
      </button>
      <div className="text-[10px] text-slate-500">{rightLabel}</div>
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
    { label: "Submodel", key: "submodel", kind: "string" },

    { label: "Engine", key: "engine", kind: "string" },
    { label: "Engine Type", key: "engine_type", kind: "string" },
    { label: "Engine Family", key: "engine_family", kind: "string" },

    { label: "Transmission", key: "transmission", kind: "string" },
    { label: "Transmission Type", key: "transmission_type", kind: "string" },

    { label: "Fuel Type", key: "fuel_type", kind: "string" },
    { label: "Drivetrain", key: "drivetrain", kind: "string" },
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

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const rawId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const isDirectoryMode = useMemo(() => {
    const v = (rawId ?? "").toLowerCase();
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
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);

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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  const vehicleExtraDetails = useMemo(
    () => computeVehicleExtraDetails(selectedVehicle),
    [selectedVehicle],
  );

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
          .select(
            "id, first_name, last_name, name, business_name, email, phone, phone_number, created_at, address, city, province, postal_code",
          )
          .eq("id", customerId)
          .maybeSingle();

        if (custErr) throw custErr;

        if (!cust) {
          setCustomer(null);
          setVehicles([]);
          setSelectedVehicleId(null);
          setWorkOrders([]);
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

        const vrows = (vs ?? []) as Vehicle[];
        setVehicles(vrows);

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
        const msg =
          e instanceof Error ? e.message : "Failed to load customer file.";
        setViewError(msg);
        setCustomer(null);
        setVehicles([]);
        setSelectedVehicleId(null);
        setWorkOrders([]);
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
        .select(
          "id, first_name, last_name, name, business_name, email, phone, phone_number, created_at",
        )
        .or(
          [
            `first_name.ilike.${like}`,
            `last_name.ilike.${like}`,
            `business_name.ilike.${like}`,
            `name.ilike.${like}`,
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

  // Optional: prime query from ?q= ONCE (do not keep syncing, avoids focus/typing weirdness)
  useEffect(() => {
    if (!isDirectoryMode && sp.get("mode") !== "search") return;

    const q = sp.get("q");
    if (q && q.trim().length && !query) {
      setQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirectoryMode]);

  // Debounced search while typing (no URL updates; avoids remount/focus loss)
  useEffect(() => {
    if (!(isDirectoryMode || sp.get("mode") === "search")) return;

    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }

    const t = window.setTimeout(() => {
      void runSearch();
    }, 250);

    return () => window.clearTimeout(t);
  }, [query, isDirectoryMode, sp, runSearch]);

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

        const { error: insErr } = await supabase.from("vehicle_media").insert(insertRow);
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
        typeof r["business_name"] === "string" ? (r["business_name"] as string) : "",
      email: customer.email ?? null,
      phone: customer.phone ?? null,
      phone_number: customer.phone_number ?? null,
      address: typeof r["address"] === "string" ? (r["address"] as string) : "",
      city: typeof r["city"] === "string" ? (r["city"] as string) : "",
      province: typeof r["province"] === "string" ? (r["province"] as string) : "",
      postal_code:
        typeof r["postal_code"] === "string" ? (r["postal_code"] as string) : "",
    });
  }, [customer]);

  const saveCustomer = useCallback(async () => {
    if (!customer) return;

    const updateRecord: Record<string, unknown> = {
      first_name:
        typeof custDraft["first_name"] === "string" ? custDraft["first_name"] : null,
      last_name:
        typeof custDraft["last_name"] === "string" ? custDraft["last_name"] : null,
      name:
        typeof custDraft["name"] === "string" ? (custDraft["name"] as string) || null : null,
      business_name:
        typeof custDraft["business_name"] === "string"
          ? (custDraft["business_name"] as string) || null
          : null,
      email: typeof custDraft["email"] === "string" ? custDraft["email"] : null,
      phone: typeof custDraft["phone"] === "string" ? custDraft["phone"] : null,
      phone_number:
        typeof custDraft["phone_number"] === "string" ? custDraft["phone_number"] : null,
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
        typeof vehDraft["year"] === "number" ? vehDraft["year"] : selectedVehicle.year ?? null,
      make:
        typeof vehDraft["make"] === "string" ? vehDraft["make"] : selectedVehicle.make ?? null,
      model:
        typeof vehDraft["model"] === "string" ? vehDraft["model"] : selectedVehicle.model ?? null,
      vin:
        typeof vehDraft["vin"] === "string" ? vehDraft["vin"] : selectedVehicle.vin ?? null,
      license_plate:
        typeof vehDraft["license_plate"] === "string"
          ? vehDraft["license_plate"]
          : (selectedVehicle as unknown as Record<string, unknown>)["license_plate"] ??
            selectedVehicle.license_plate ??
            null,
      mileage:
        typeof vehDraft["mileage"] === "string"
          ? vehDraft["mileage"]
          : (selectedVehicle as unknown as Record<string, unknown>)["mileage"] ??
            selectedVehicle.mileage ??
            null,
    };

    // Optional-ish vehicle fields (confirmed by your vehicles table)
    if (typeof vehDraft["unit_number"] === "string")
      updateRecord["unit_number"] = vehDraft["unit_number"] || null;
    if (typeof vehDraft["color"] === "string")
      updateRecord["color"] = vehDraft["color"] || null;
    if (vehDraft["engine_hours"] === null || typeof vehDraft["engine_hours"] === "number") {
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

       const { error } = await supabase
      .from("vehicles")
      .update(updateRecord as DB["public"]["Tables"]["vehicles"]["Update"])
      .eq("id", selectedVehicle.id);

    if (error) {
      setViewError(error.message);
      return;
    }

    setEditVehicleOpen(false);
    if (customer?.id) await fetchCustomerFile(customer.id);
  }, [customer?.id, fetchCustomerFile, selectedVehicle, supabase, vehDraft]);

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
  });

  const createVehicle = useCallback(async () => {
    if (!customer?.id) return;

    const insertRecord: Record<string, unknown> = {
      customer_id: customer.id,
      year: typeof newVeh["year"] === "number" ? newVeh["year"] : null,
      make: typeof newVeh["make"] === "string" ? (newVeh["make"] as string) || null : null,
      model: typeof newVeh["model"] === "string" ? (newVeh["model"] as string) || null : null,
      vin: typeof newVeh["vin"] === "string" ? (newVeh["vin"] as string) || null : null,
      license_plate:
        typeof newVeh["license_plate"] === "string" ? (newVeh["license_plate"] as string) || null : null,
      mileage: typeof newVeh["mileage"] === "string" ? (newVeh["mileage"] as string) || null : null,
    };

    if (typeof newVeh["unit_number"] === "string") insertRecord["unit_number"] = newVeh["unit_number"] || null;
    if (typeof newVeh["color"] === "string") insertRecord["color"] = newVeh["color"] || null;
    if (typeof newVeh["engine_hours"] === "number") insertRecord["engine_hours"] = newVeh["engine_hours"];

    // ✅ extra vehicle profile fields (confirmed by your vehicles table)
    if (typeof newVeh["submodel"] === "string") insertRecord["submodel"] = newVeh["submodel"] || null;

    if (typeof newVeh["engine"] === "string") insertRecord["engine"] = newVeh["engine"] || null;
    if (typeof newVeh["engine_type"] === "string") insertRecord["engine_type"] = newVeh["engine_type"] || null;
    if (typeof newVeh["engine_family"] === "string") insertRecord["engine_family"] = newVeh["engine_family"] || null;

    if (typeof newVeh["transmission"] === "string") insertRecord["transmission"] = newVeh["transmission"] || null;
    if (typeof newVeh["transmission_type"] === "string")
      insertRecord["transmission_type"] = newVeh["transmission_type"] || null;

    if (typeof newVeh["fuel_type"] === "string") insertRecord["fuel_type"] = newVeh["fuel_type"] || null;
    if (typeof newVeh["drivetrain"] === "string") insertRecord["drivetrain"] = newVeh["drivetrain"] || null;

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
  }, [customer?.id, fetchCustomerFile, newVeh, supabase]);

  // ------------------ DIRECTORY MODE ------------------
  if (isDirectoryMode || sp.get("mode") === "search") {
    return (
      <PageShell>
        <TopBar rightLabel="Customers" onBack={() => router.back()} />

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

            <div className="flex w-full gap-2 sm:w-[560px]">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
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
              <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>Start typing to search customers.</div>
            ) : results.length === 0 ? (
              <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>
                {searching ? "Searching…" : "No matches yet."}
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => {
                  const phone = r.phone ?? r.phone_number ?? null;
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
                            {r.business_name?.trim()
                              ? r.business_name
                              : r.name?.trim()
                                ? r.name
                                : fmtName(r)}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-400">
                            {r.business_name?.trim() && (r.first_name || r.last_name)
                              ? fmtName(r)
                              : r.business_name?.trim()
                                ? "—"
                                : r.name?.trim()
                                  ? fmtName(r)
                                  : "—"}
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
                        <div className="text-[10px] text-slate-500">{safeDate(r.created_at)}</div>
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

  // ------------------ Non-UUID guard ------------------
  if (!effectiveCustomerId) {
    return (
      <PageShell>
        <div className={`${CARD_BASE} p-4`}>
          <div className="text-sm text-slate-200">This route expects a customer id.</div>
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

  // ------------------ CUSTOMER FILE MODE ------------------
  return (
    <PageShell>
      <TopBar rightLabel="Customer File" onBack={() => router.back()} />

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
                  {(() => {
                    const biz = customer.business_name?.trim() ?? "";
                    const disp = customer.name?.trim() ?? "";
                    const title = biz || disp || fmtName(customer);

                    return (
                      <>
                        <h1
                          className="truncate text-2xl font-semibold text-white sm:text-3xl"
                          style={{ fontFamily: "var(--font-blackops), system-ui" }}
                        >
                          {title}
                        </h1>

                        {biz && (customer.first_name || customer.last_name) ? (
                          <div className="mt-1 text-xs text-slate-400">{fmtName(customer)}</div>
                        ) : null}

                        <div className="mt-2 text-sm text-slate-300">
                          {customer.email ?? "—"}
                          {customer.phone ?? customer.phone_number ? (
                            <>
                              <span className="mx-2 text-slate-600">•</span>
                              {customer.phone ?? customer.phone_number}
                            </>
                          ) : null}
                        </div>
                      </>
                    );
                  })()}

                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    <div>{asText((customer as unknown as Record<string, unknown>)["address"])}</div>
                    <div>
                      {[
                        (customer as unknown as Record<string, unknown>)["city"],
                        (customer as unknown as Record<string, unknown>)["province"],
                        (customer as unknown as Record<string, unknown>)["postal_code"],
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
                    className="rounded-xl border border-slate-700/60 bg-black/40 px-4 py-2 text-sm font-semibold text-white hover:border-[rgba(184,115,51,0.65)]"
                  >
                    Edit customer
                  </button>

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
            </div>

            {/* Vehicles */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white sm:text-base">Vehicles</h2>
                  <p className="mt-1 text-[11px] text-slate-400">Select a vehicle to view details and files.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAddVehicleOpen(true)}
                    className="rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-[12px] font-semibold text-white hover:border-[rgba(184,115,51,0.65)]"
                  >
                    + Add vehicle
                  </button>

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

                  {selectedVehicle ? (
                    <button
                      type="button"
                      onClick={() => setEditVehicleOpen(true)}
                      className="rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-[12px] font-semibold text-white hover:border-[rgba(184,115,51,0.65)]"
                    >
                      Edit vehicle
                    </button>
                  ) : null}
                </div>
              </div>

              {vehicles.length === 0 ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>No vehicles linked to this customer yet.</div>
              ) : selectedVehicle ? (
                <div className="mt-3 space-y-3">
                  <div className={`${CARD_INNER} p-3`}>
                    <div className="text-sm font-semibold text-white">{fmtVehicleLabel(selectedVehicle)}</div>

                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <DetailRow label="VIN" value={selectedVehicle.vin} />
                      <DetailRow
                        label="License Plate"
                        value={
                          ((selectedVehicle as unknown as Record<string, unknown>)["license_plate"] as
                            | string
                            | null
                            | undefined) ?? selectedVehicle.license_plate
                        }
                      />
                      <DetailRow
                        label="Mileage"
                        value={
                          ((selectedVehicle as unknown as Record<string, unknown>)["mileage"] as
                            | string
                            | null
                            | undefined) ?? selectedVehicle.mileage
                        }
                      />
                      <DetailRow
                        label="Unit #"
                        value={(selectedVehicle as unknown as Record<string, unknown>)["unit_number"] as
                          | string
                          | null
                          | undefined}
                      />
                      <DetailRow
                        label="Color"
                        value={(selectedVehicle as unknown as Record<string, unknown>)["color"] as
                          | string
                          | null
                          | undefined}
                      />
                      <DetailRow
                        label="Engine Hours"
                        value={(selectedVehicle as unknown as Record<string, unknown>)["engine_hours"] as
                          | number
                          | null
                          | undefined}
                      />
                    </div>

                    {vehicleExtraDetails.length > 0 ? (
                      <div className="mt-3">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Additional vehicle details
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {vehicleExtraDetails.map((it) => (
                            <DetailRow key={it.label} label={it.label} value={it.value} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* History */}
            <div className={`${CARD_BASE} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white sm:text-base">Work Order History</h2>
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
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>No work orders yet.</div>
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
                            {(wo as unknown as Record<string, unknown>)["custom_id"]
                              ? `WO ${(wo as unknown as Record<string, unknown>)["custom_id"] as string}`
                              : `WO #${wo.id.slice(0, 8)}`}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">{safeDate(wo.created_at)}</div>
                        </div>

                        <span className={chipClass((wo as unknown as Record<string, unknown>)["status"] as string | null)}>
                          {String(((wo as unknown as Record<string, unknown>)["status"] as string | null) ?? "awaiting").replaceAll("_", " ")}
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
              <p className="mt-1 text-[11px] text-slate-400">Condition photos, damage evidence, before/after.</p>
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
                {uploadingPhoto ? <div className="mt-2 text-[11px] text-slate-400">Uploading photo…</div> : null}
              </div>
            </div>

            <div className={`${CARD_BASE} p-4`}>
              <h3 className="text-sm font-semibold text-white">Upload Documents</h3>
              <p className="mt-1 text-[11px] text-slate-400">Registration, CVIP, inspection PDFs, misc docs.</p>
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
                {uploadingDoc ? (
                  <div className="mt-2 text-[11px] text-slate-400">Uploading document…</div>
                ) : null}
              </div>
            </div>

            <div className={`${CARD_BASE} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">Vehicle Gallery & Files</h3>
                  <p className="mt-1 text-[11px] text-slate-400">Files shown for the selected vehicle.</p>
                </div>
                {selectedVehicleId ? (
                  <button
                    type="button"
                    onClick={() => void fetchRawMedia(selectedVehicleId)}
                    className="rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-[11px] font-semibold text-white hover:border-[rgba(184,115,51,0.65)]"
                  >
                    Refresh
                  </button>
                ) : null}
              </div>

              {!selectedVehicleId ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>Select a vehicle to view files.</div>
              ) : media.length === 0 ? (
                <div className={`${CARD_INNER} mt-3 p-3 text-sm text-slate-300`}>No files uploaded yet.</div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {media.map((m) => {
                    const url = m.displayUrl ?? m.url ?? null;
                    const img = m.kind === "photo" || isImageUrl(url);
                    const title = m.filename ?? (m.type ?? "file");

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setViewerItem(m);
                          setViewerOpen(true);
                        }}
                        className="block overflow-hidden rounded-xl border border-slate-700/60 bg-black/40 hover:border-[rgba(184,115,51,0.65)]"
                        title={title}
                      >
                        {img && url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={title} className="h-28 w-full object-cover" />
                        ) : (
                          <div className="flex h-28 w-full items-center justify-center px-2 text-center text-[11px] text-slate-300">
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
              className="rounded-xl border border-slate-700/60 bg-black/40 px-4 py-2 text-[12px] font-semibold text-white hover:border-[rgba(184,115,51,0.65)]"
            >
              Open in new tab
            </a>
          ) : null
        }
      >
        {!viewerItem ? (
          <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>No file selected.</div>
        ) : !viewerItem.displayUrl ? (
          <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>
            This file doesn’t have a viewable URL yet (likely a private bucket without a signed URL).
          </div>
        ) : viewerItem.kind === "photo" || isImageUrl(viewerItem.displayUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewerItem.displayUrl} alt={viewerItem.filename ?? "photo"} className="w-full rounded-xl" />
        ) : (
          <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>Document ready. Use “Open in new tab”.</div>
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
              className="rounded-xl border border-slate-700/60 bg-black/40 px-4 py-2 text-[12px] font-semibold text-white hover:border-slate-500/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveCustomer()}
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-[12px] font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
              <input
                value={String(custDraft[key] ?? "")}
                onChange={(e) => setCustDraft((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
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
              className="rounded-xl border border-slate-700/60 bg-black/40 px-4 py-2 text-[12px] font-semibold text-white hover:border-slate-500/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveVehicle()}
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-[12px] font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
            >
              Save
            </button>
          </>
        }
      >
        {!selectedVehicle ? (
          <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>No vehicle selected.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["Year", "year"],
                ["Make", "make"],
                ["Model", "model"],
                ["Submodel", "submodel"],
                ["VIN", "vin"],
                ["License plate", "license_plate"],
                ["Mileage", "mileage"],
                ["Unit #", "unit_number"],
                ["Color", "color"],
                ["Engine hours", "engine_hours"],
                ["Engine", "engine"],
                ["Engine type", "engine_type"],
                ["Engine family", "engine_family"],
                ["Transmission", "transmission"],
                ["Transmission type", "transmission_type"],
                ["Fuel type", "fuel_type"],
                ["Drivetrain", "drivetrain"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                <input
                  value={String(vehDraft[key] ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setVehDraft((p) => {
                      if (key === "year" || key === "engine_hours") {
                        const n = raw.trim().length ? Number(raw) : null;
                        return { ...p, [key]: Number.isFinite(n as number) ? n : null };
                      }
                      return { ...p, [key]: raw };
                    });
                  }}
                  className="w-full rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
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
              className="rounded-xl border border-slate-700/60 bg-black/40 px-4 py-2 text-[12px] font-semibold text-white hover:border-slate-500/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void createVehicle()}
              className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-[12px] font-semibold text-black shadow-[0_0_22px_rgba(212,118,49,0.75)] hover:brightness-110"
              disabled={!customer}
            >
              Create
            </button>
          </>
        }
      >
        {!customer ? (
          <div className={`${CARD_INNER} p-3 text-sm text-slate-300`}>No customer loaded.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["Year", "year"],
                ["Make", "make"],
                ["Model", "model"],
                ["Submodel", "submodel"],
                ["VIN", "vin"],
                ["License plate", "license_plate"],
                ["Mileage", "mileage"],
                ["Unit #", "unit_number"],
                ["Color", "color"],
                ["Engine hours", "engine_hours"],
                ["Engine", "engine"],
                ["Engine type", "engine_type"],
                ["Engine family", "engine_family"],
                ["Transmission", "transmission"],
                ["Transmission type", "transmission_type"],
                ["Fuel type", "fuel_type"],
                ["Drivetrain", "drivetrain"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                <input
                  value={String(newVeh[key] ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setNewVeh((p) => {
                      if (key === "year" || key === "engine_hours") {
                        const n = raw.trim().length ? Number(raw) : null;
                        return { ...p, [key]: Number.isFinite(n as number) ? n : null };
                      }
                      return { ...p, [key]: raw };
                    });
                  }}
                  className="w-full rounded-xl border border-slate-700/60 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]"
                />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </PageShell>
  );
}