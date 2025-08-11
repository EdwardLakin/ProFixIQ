"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import { format, formatDistance } from "date-fns";
import DtcSuggestionPopup from "@work-orders/components/workorders/DtcSuggestionPopup";

const supabase = createClientComponentClient<Database>();

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const statusBadge = {
  awaiting: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
};

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tech, setTech] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id || typeof id !== "string") return;

    setLoading(true);

    const { data, error } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("id", id)
      .single();

    if (error) console.error("Failed to fetch work order:", error);

    if (data) {
      setLine(data);

      if (data.vehicle_id) {
        const { data: vehicleData } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", data.vehicle_id)
          .single();
        if (vehicleData) setVehicle(vehicleData);
      }

      if (data.assigned_to) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.assigned_to)
          .single();
        if (profileData) setTech(profileData);
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const generateLaborTime = async () => {
      if (
        line &&
        (line.job_type === "diagnosis" || line.job_type === "repair") &&
        !line.labor_time &&
        line.complaint &&
        vehicle
      ) {
        try {
          const res = await fetch("/api/ai/estimate-labor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              complaint: line.complaint,
              jobType: line.job_type,
            }),
          });

          const { hours } = await res.json();

          if (hours && !isNaN(hours)) {
            const { error: updateError } = await supabase
              .from("work_order_lines")
              .update({ labor_time: hours })
              .eq("id", line.id);

            if (!updateError) {
              setLine((prev) => (prev ? { ...prev, labor_time: hours } : prev));
            } else {
              console.error(
                "Failed to update labor_time in DB:",
                updateError.message,
              );
            }
          }
        } catch (err) {
          console.error("AI labor estimate error:", err);
        }
      }
    };

    generateLaborTime();
  }, [line, vehicle]);

  const getPunchDuration = () => {
    if (line?.punched_in_at && line?.punched_out_at) {
      return formatDistance(
        new Date(line.punched_out_at),
        new Date(line.punched_in_at),
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6">
      <PreviousPageButton to="/work-orders/queue" />

      {loading && <div className="p-6">Loading...</div>}
      {!line && !loading && (
        <div className="p-6 text-red-500">Work order not found.</div>
      )}

      {line && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Work Order: {line.id}</h1>
            <span
              className={`text-sm px-2 py-1 rounded ${statusBadge[line.status as keyof typeof statusBadge]}`}
            >
              {line.status.replace("_", " ")}
            </span>
          </div>

          <div className="border rounded p-4 bg-white dark:bg-gray-900 shadow">
            <p>
              <strong>Complaint:</strong> {line.complaint || "—"}
            </p>
            <p>
              <strong>Assigned To:</strong> {tech?.full_name || "Unassigned"}
            </p>
            <p>
              <strong>Punched In:</strong>{" "}
              {line.punched_in_at
                ? format(new Date(line.punched_in_at), "PPpp")
                : "—"}
            </p>
            <p>
              <strong>Punched Out:</strong>{" "}
              {line.punched_out_at
                ? format(new Date(line.punched_out_at), "PPpp")
                : "—"}
            </p>
            {getPunchDuration() && (
              <p>
                <strong>Duration:</strong> {getPunchDuration()}
              </p>
            )}
            <p>
              <strong>Hold Reason:</strong> {line.hold_reason || "—"}
            </p>
            <p>
              <strong>Labor Time (hrs):</strong> {line.labor_time ?? "—"}
            </p>
            <p>
              <strong>Created:</strong>{" "}
              {line.created_at
                ? format(new Date(line.created_at), "PPpp")
                : "—"}
            </p>
          </div>

          <div className="border rounded p-4 bg-white dark:bg-gray-900 shadow mt-4">
            <h2 className="font-semibold mb-2">Vehicle Info</h2>
            {vehicle ? (
              <p>
                {vehicle.year} {vehicle.make} {vehicle.model}
              </p>
            ) : (
              <p>Unknown vehicle</p>
            )}
          </div>

          {line?.job_type === "diagnosis" &&
            line.punched_in_at &&
            !line.cause &&
            !line.correction &&
            !line.labor_time &&
            vehicle && (
              <DtcSuggestionPopup
                jobId={line.id}
                vehicle={{
                  id: vehicle.id,
                  year: vehicle.year,
                  make: vehicle.make,
                  model: vehicle.model,
                }}
              />
            )}
        </>
      )}
    </div>
  );
}
