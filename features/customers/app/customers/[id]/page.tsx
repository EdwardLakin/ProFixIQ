"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";

type DB = Database;
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleMedia = DB["public"]["Tables"]["vehicle_media"]["Row"];

type ParamsShape = Record<string, string | string[]>;
function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

const statusBadge: Record<string, string> = {
  awaiting: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  invoiced: "bg-purple-100 text-purple-800",
};

// 🔸 Keep your original buckets
const BUCKET_PHOTOS = "vehicle_photos";
const BUCKET_DOCS = "vehicle_docs";

function bucketForKind(kind: "photo" | "document") {
  return kind === "photo" ? BUCKET_PHOTOS : BUCKET_DOCS;
}

/** Small, typed display row (no `any`) */
function Detail({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-950 px-3 py-2">
      <div className="text-neutral-400">{label}</div>
      <div className="font-medium text-white truncate">{value ?? "—"}</div>
    </div>
  );
}

export default function CustomerProfilePage() {
  const params = useParams();
  const customerId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleMedia, setVehicleMedia] = useState<VehicleMedia[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Fetch the core profile data
  const fetchAll = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);

    // Customer
    const { data: c } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .maybeSingle();
    setCustomer(c ?? null);

    // Vehicles for this customer
    const { data: vs } = await supabase
      .from("vehicles")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });
    setVehicles(vs ?? []);

    // Default selected vehicle (first found)
    setSelectedVehicleId((vs?.length ?? 0) > 0 ? vs![0].id : null);

    // Work orders for this customer
    const { data: wos } = await supabase
      .from("work_orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    setWorkOrders(wos ?? []);

    setLoading(false);
  }, [customerId, supabase]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Fetch media for selected vehicle
  useEffect(() => {
    (async () => {
      if (!selectedVehicleId) {
        setVehicleMedia([]);
        return;
      }
      const { data: media } = await supabase
        .from("vehicle_media")
        .select("*")
        .eq("vehicle_id", selectedVehicleId)
        .order("created_at", { ascending: false });
      setVehicleMedia(media ?? []);
    })();
  }, [selectedVehicleId, supabase]);

  // Upload handlers (unchanged)
  async function handleUpload(
    file: File,
    kind: "photo" | "document"
  ): Promise<void> {
    if (!selectedVehicleId) return;
    const now = Date.now();
    const storagePath = `${selectedVehicleId}/${now}-${file.name}`;
    const bucket = bucketForKind(kind);

    const isPhoto = kind === "photo";
    isPhoto ? setUploadingPhoto(true) : setUploadingDoc(true);

    try {
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });

      if (upErr) {
        console.error("Upload error:", upErr.message);
        return;
      }

      const { data: pub } = await supabase.storage.from(bucket).getPublicUrl(storagePath);
      const publicUrl = pub?.publicUrl ?? null;

      await supabase.from("vehicle_media").insert({
        vehicle_id: selectedVehicleId,
        url: publicUrl,
        type: kind,
        filename: file.name,
        storage_path: storagePath,
        storage_bucket: bucket,
      } as unknown as VehicleMedia); // (kept as before; not introducing new `any`)
      // refresh media
      const { data: media } = await supabase
        .from("vehicle_media")
        .select("*")
        .eq("vehicle_id", selectedVehicleId)
        .order("created_at", { ascending: false });
      setVehicleMedia(media ?? []);
    } finally {
      isPhoto ? setUploadingPhoto(false) : setUploadingDoc(false);
    }
  }

  const chipClass = (s: string | null): string => {
    const key = (s ?? "awaiting") as keyof typeof statusBadge;
    return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
  };

  const selectedVehicle = selectedVehicleId
    ? vehicles.find((v) => v.id === selectedVehicleId) ?? null
    : null;

  if (!customerId) {
    return <div className="p-6 text-red-400">Missing customer id.</div>;
  }

  return (
    <div className="p-4 sm:p-6 text-white">
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="text-sm text-neutral-300 hover:text-white"
        >
          ← Back
        </button>
      </div>

      {loading && <div>Loading…</div>}

      {!loading && !customer && (
        <div className="text-red-400">Customer not found.</div>
      )}

      {!loading && customer && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: Profile, vehicles, history */}
          <div className="space-y-6">
            {/* Customer Header — now shows FULL details */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold">
                    {[customer.first_name ?? "", customer.last_name ?? ""]
                      .filter(Boolean)
                      .join(" ") || "Customer"}
                  </h1>
                  <div className="mt-1 text-sm text-neutral-300">
                    {customer.email ?? "—"} {customer.phone ? `• ${customer.phone}` : ""}
                  </div>

                  {/* FULL address block */}
                  <div className="mt-2 text-sm text-neutral-400 leading-6">
                    <div>{customer.address ?? "—"}</div>
                    <div>
                      {[customer.city, customer.province, customer.postal_code]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() =>
                    router.push(
                      `/work-orders/create?customerId=${customer.id}${
                        selectedVehicleId ? `&vehicleId=${selectedVehicleId}` : ""
                      }`
                    )
                  }
                  className="rounded bg-orange-500 px-3 py-2 font-semibold text-black hover:bg-orange-600 shrink-0"
                >
                  Create Work Order
                </button>
              </div>
            </div>

            {/* Vehicles */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Vehicles</h2>
                {vehicles.length > 0 ? (
                  <select
                    value={selectedVehicleId ?? ""}
                    onChange={(e) => setSelectedVehicleId(e.target.value || null)}
                    className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {[(v.year ?? "").toString(), v.make ?? "", v.model ?? ""]
                          .filter(Boolean)
                          .join(" ")}{" "}
                        {v.license_plate ? `• ${v.license_plate}` : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>

              {vehicles.length === 0 ? (
                <p className="text-sm text-neutral-400">No vehicles yet.</p>
              ) : selectedVehicle ? (
                <>
                  <div className="text-sm text-neutral-300">
                    <div className="font-medium">
                      {[(selectedVehicle.year ?? "").toString(), selectedVehicle.make ?? "", selectedVehicle.model ?? ""]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                  </div>

                  {/* FULL vehicle details grid */}
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Detail label="VIN" value={selectedVehicle.vin} />
                    <Detail label="License Plate" value={selectedVehicle.license_plate} />
                    <Detail label="Mileage" value={selectedVehicle.mileage} />
                    <Detail label="Unit #" value={selectedVehicle.unit_number} />
                    <Detail label="Color" value={selectedVehicle.color} />
                    <Detail
                      label="Engine Hours"
                      value={
                        typeof selectedVehicle.engine_hours === "number"
                          ? selectedVehicle.engine_hours
                          : selectedVehicle.engine_hours ?? "—"
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>

            {/* Work Order History */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-3 text-lg font-semibold">Work Order History</h2>
              {workOrders.length === 0 ? (
                <p className="text-sm text-neutral-400">No work orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {workOrders.map((wo) => (
                    <button
                      key={wo.id}
                      onClick={() => router.push(`/work-orders/${wo.id}`)}
                      className="w-full text-left rounded border border-neutral-800 bg-neutral-950 p-3 hover:border-orange-500"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {wo.custom_id ? `WO ${wo.custom_id}` : `WO #${wo.id.slice(0, 8)}`}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {wo.created_at ? format(new Date(wo.created_at), "PPpp") : "—"}
                          </div>
                        </div>
                        <span className={chipClass(wo.status ?? null)}>
                          {(wo.status ?? "awaiting").replaceAll("_", " ")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Uploads & Media for selected vehicle */}
          <aside className="space-y-6">
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-semibold">Upload Vehicle Photos</h3>
              <p className="text-xs text-neutral-400 mb-2">
                Attach condition photos or repair evidence.
              </p>
              <input
                type="file"
                accept="image/*"
                disabled={!selectedVehicleId || uploadingPhoto}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f, "photo");
                  e.currentTarget.value = "";
                }}
                className="text-sm"
              />
              {uploadingPhoto && (
                <div className="mt-2 text-xs text-neutral-400">Uploading photo…</div>
              )}
            </div>

            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="font-semibold">Upload Documents</h3>
              <p className="text-xs text-neutral-400 mb-2">
                Registration, CVIP certificate, inspection sheets, etc.
              </p>
              <input
                type="file"
                accept="application/pdf,image/*"
                disabled={!selectedVehicleId || uploadingDoc}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f, "document");
                  e.currentTarget.value = "";
                }}
                className="text-sm"
              />
              {uploadingDoc && (
                <div className="mt-2 text-xs text-neutral-400">Uploading document…</div>
              )}
            </div>

            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-2 font-semibold">Vehicle Gallery & Docs</h3>
              {!selectedVehicleId ? (
                <p className="text-sm text-neutral-400">Select a vehicle to view files.</p>
              ) : vehicleMedia.length === 0 ? (
                <p className="text-sm text-neutral-400">No files uploaded yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {vehicleMedia.map((m) => {
                    const isImage =
                      (m.type ?? "") === "photo" ||
                      (m.url ?? "").match(/\.(png|jpe?g|gif|webp)$/i) !== null;
                    return (
                      <a
                        key={m.id}
                        href={m.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded border border-neutral-800 bg-neutral-950 hover:border-orange-500 overflow-hidden"
                        title={m.filename ?? undefined}
                      >
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.url ?? ""}
                            alt={m.filename ?? "vehicle photo"}
                            className="h-32 w-full object-cover"
                          />
                        ) : (
                          <div className="h-32 w-full flex items-center justify-center text-xs text-neutral-400">
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
    </div>
  );
}