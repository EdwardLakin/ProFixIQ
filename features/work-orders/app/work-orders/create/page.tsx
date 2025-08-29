"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { insertPrioritizedJobsFromInspection } from "@work-orders/lib/work-orders/insertPrioritizedJobsFromInspection";

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);

  const [location, setLocation] = useState("");
  const [type, setType] = useState("inspection"); // "inspection" | "maintenance" | "diagnosis"
  const [notes, setNotes] = useState("");

  // for UI only (avoid typing whole DB rows)
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // read query params
  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    const i = searchParams.get("inspectionId");
    if (v) setVehicleId(v);
    if (c) setCustomerId(c);
    if (i) {
      setInspectionId(i);
      setType("inspection");
    }
  }, [searchParams]);

  // fetch labels for display
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (vehicleId) {
        const { data } = await supabase
          .from("vehicles")
          .select("year, make, model")
          .eq("id", vehicleId)
          .single();

        if (!cancelled) {
          setVehicleLabel(
            data ? `${data.year ?? ""} ${data.make ?? ""} ${data.model ?? ""}`.trim() : "",
          );
        }
      }

      if (customerId) {
        const { data } = await supabase
          .from("customers")
          .select("first_name, email")
          .eq("id", customerId)
          .single();

        if (!cancelled) {
          setCustomerLabel(
            data ? `${data.first_name ?? ""}${data.email ? ` (${data.email})` : ""}`.trim() : "",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vehicleId, customerId, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!vehicleId || !customerId) {
      setError("Vehicle and Customer must be selected.");
      setLoading(false);
      return;
    }

    const newId = uuidv4();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be signed in to create a work order.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("work_orders").insert({
      id: newId,
      vehicle_id: vehicleId,
      customer_id: customerId,
      inspection_id: inspectionId,
      location,
      type,
      notes,
    });

    if (insertError) {
      setError("Failed to create work order.");
      setLoading(false);
      return;
    }

    if (inspectionId) {
      await insertPrioritizedJobsFromInspection(newId, inspectionId, user.id, vehicleId);
    }

    router.push(`/work-orders/view/${newId}`);
  }

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6 text-white">
      <h1 className="text-2xl font-bold">Create Work Order</h1>

      {error ? <div className="rounded bg-red-100 px-4 py-2 text-red-700">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
            placeholder="E.g., Bay 2"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label className="block font-medium">Work Order Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
            disabled={loading}
          >
            <option value="inspection">Inspection</option>
            <option value="maintenance">Maintenance</option>
            <option value="diagnosis">Diagnosis</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Work Order Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-neutral-600 bg-neutral-800 p-2 text-white"
            rows={3}
            placeholder="Optional notes for technician"
            disabled={loading}
          />
        </div>

        <div className="space-y-1 text-sm text-neutral-400">
          <p>
            <strong>Vehicle:</strong> {vehicleLabel || vehicleId || "—"}
          </p>
          <p>
            <strong>Customer:</strong> {customerLabel || customerId || "—"}
          </p>
          {inspectionId ? (
            <p>
              <strong>Inspection ID:</strong> {inspectionId}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600"
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
      </form>
    </div>
  );
}