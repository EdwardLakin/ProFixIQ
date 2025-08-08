"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@shared/lib/supabaseClient";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "@shared/types/supabase";
import { insertPrioritizedJobsFromInspection } from "@shared/lib/work-orders/insertPrioritizedJobsFromInspection";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];

export default function CreateWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [type, setType] = useState<"inspection" | "maintenance" | "diagnosis">(
    "inspection",
  );
  const [notes, setNotes] = useState("");

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const v = searchParams.get("vehicleId");
    const c = searchParams.get("customerId");
    const i = searchParams.get("inspectionId");

    if (v) setVehicleId(v);
    if (c) setCustomerId(c);
    if (i) {
      setInspectionId(i);
      setType("inspection"); // Auto-set if inspection
    }
  }, [searchParams]);

  useEffect(() => {
    if (vehicleId) {
      supabase
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .single()
        .then(({ data }) => {
          if (data) setVehicle(data);
        });
    }
    if (customerId) {
      supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single()
        .then(({ data }) => {
          if (data) setCustomer(data);
        });
    }
  }, [vehicleId, customerId]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      await insertPrioritizedJobsFromInspection(
        newId,
        inspectionId,
        user.id,
        vehicleId,
      );
    }

    router.push(`/work-orders/view/${newId}`);
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Create Work Order</h1>

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-600 text-white"
            placeholder="E.g., Bay 2"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label className="block font-medium">Work Order Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-600 text-white"
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
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-600 text-white"
            rows={3}
            placeholder="Optional notes for technician"
            disabled={loading}
          />
        </div>

        <div className="text-sm text-gray-400 space-y-1">
          <p>
            <strong>Vehicle:</strong>{" "}
            {vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : vehicleId || "—"}
          </p>
          <p>
            <strong>Customer:</strong>{" "}
            {customer
              ? `${customer.full_name} (${customer.email})`
              : customerId || "—"}
          </p>
          {inspectionId && (
            <p>
              <strong>Inspection ID:</strong> {inspectionId}
            </p>
          )}
        </div>

        <div className="flex gap-4 items-center">
          <button
            type="submit"
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded font-semibold"
          >
            {loading ? "Creating..." : "Create Work Order"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/work-orders")}
            className="text-sm text-gray-400 hover:underline"
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
