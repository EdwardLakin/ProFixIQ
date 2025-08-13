"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { format, formatDistanceStrict } from "date-fns";

import { toast } from "sonner";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import DtcSuggestionPopup from "@work-orders/components/workorders/DtcSuggestionPopup";
import PartsRequestModal from "@work-orders/components/workorders/PartsRequestModal";
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import { generateQuotePDFBytes } from "@work-orders/lib/work-orders/generateQuotePdf";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];
type WorkOrder = Database["public"]["Tables"]["work_orders"]["Row"];

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
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState("");
  const [techNotes, setTechNotes] = useState("");
  const [updatingNotes, setUpdatingNotes] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  const supabase = createBrowserClient<Database>();

  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [isCauseModalOpen, setIsCauseModalOpen] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  const [relatedJobs, setRelatedJobs] = useState<Array<WorkOrderLine>>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
      else console.error("No user found", error);
    };

    fetchUser();
  }, []);

  const fetchData = useCallback(async () => {
    if (!id || typeof id !== "string") return;
    setLoading(true);

    const { data, error } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setLine(data);
      setActiveJobId(data.punched_out_at ? null : data.id);
      setTechNotes(data.tech_notes || "");

      if (data.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("*")
          .eq("id", data.vehicle_id)
          .single();
        if (v) setVehicle(v);
      }

      if (data.assigned_to) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.assigned_to)
          .single();
        if (profile) setTech(profile);
      }

      if (data.work_order_id) {
        const { data: wo } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", data.work_order_id)
          .single();
        if (wo) setWorkOrder(wo);

        const { data: jobs } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("work_order_id", data.work_order_id)
          .order("created_at", { ascending: true });

        if (jobs) setRelatedJobs(jobs);

        if (wo?.customer_id) {
          const { data: cust } = await supabase
            .from("customers")
            .select("*")
            .eq("id", wo.customer_id)
            .single();
          if (cust) setCustomer(cust);
        }
      }
    }

    if (error) console.error("Failed to fetch:", error);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (line?.punched_in_at && !line?.punched_out_at) {
        setDuration(
          formatDistanceStrict(new Date(), new Date(line.punched_in_at)),
        );
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [line]);

  const handlePunchIn = async (jobId: string) => {
    if (activeJobId) {
      toast.error("You are already punched in to a job.");
      return;
    }

    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: new Date().toISOString() })
      .eq("id", jobId);

    if (!error) {
      toast.success("Punched in");
      fetchData();
    }
  };

  const handleCompleteJob = async (cause: string, correction: string) => {
    if (!line) return;
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        cause,
        correction,
        punched_out_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", line.id);
    if (!error) {
      fetchData();
      setIsCauseModalOpen(false);
    }
  };

  const updateTechNotes = async () => {
    if (!line) return;
    setUpdatingNotes(true);
    const { error } = await supabase
      .from("work_order_lines")
      .update({ tech_notes: techNotes })
      .eq("id", line.id);
    if (!error) toast.success("Notes updated");
    setUpdatingNotes(false);
  };

  const requestAuthorization = async () => {
    if (!line) return;
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        hold_reason: "Awaiting customer authorization",
        status: "on_hold",
      })
      .eq("id", line.id);
    if (!error) {
      toast.success("Job put on hold for authorization");
      fetchData();
    }
  };

  const handleDownloadQuote = async () => {
    if (!line?.work_order_id || !line.vehicle_id) {
      toast.error("Missing work order or vehicle info");
      return;
    }

    const { data: jobs, error: jobsError } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("work_order_id", line.work_order_id)
      .eq("job_type", "tech-suggested");

    if (jobsError || !jobs?.length) {
      toast.error("Failed to fetch tech-suggested jobs.");
      return;
    }

    const pdfBytes = await generateQuotePDFBytes(jobs, jobs[0]?.vehicle_id ?? "");
    const fileName = `quote-${line.work_order_id}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("quotes")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      toast.error("Failed to upload quote PDF");
      return;
    }

    const { data: publicUrlData } = await supabase.storage
      .from("quotes")
      .getPublicUrl(fileName);
    const publicUrl = publicUrlData?.publicUrl;

    await supabase
      .from("work_orders")
      .update({ quote_url: publicUrl })
      .eq("id", line.work_order_id);

    const { data: workOrder } = await supabase
      .from("work_orders")
      .select("id, customer:customer_id (email, full_name)")
      .eq("id", line.work_order_id)
      .single<{
        id: string;
        customer: { email: string; full_name: string } | null;
      }>();

    const customerEmail = workOrder?.customer?.email;
    const customerName = workOrder?.customer?.full_name;

    if (customerEmail && publicUrl) {
      await fetch("/api/send-email", {
        method: "POST",
        body: JSON.stringify({
          email: customerEmail,
          subject: `Quote for Work Order #${line.work_order_id}`,
          html: `<p>Hi ${customerName || ""},</p>
                 <p>Your quote is ready: <a href="${publicUrl}" target="_blank">View Quote PDF</a></p>`,
          summaryHtml: `<h2>Quote for Work Order</h2><p><a href="${publicUrl}">View PDF</a></p>`,
          fileName,
        }),
        headers: { "Content-Type": "application/json" },
      });

      await supabase.from("email_logs").insert({
        recipient: customerEmail,
        subject: `Quote for Work Order #${line.work_order_id}`,
        quote_url: publicUrl,
        work_order_id: line.work_order_id,
      });
    }

    toast.success("Quote PDF sent to customer and saved");
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PreviousPageButton to="/work-orders/queue" />

      {vehicle && customer && (
        <div className="border rounded p-4 bg-white dark:bg-gray-900">
          <button
            className="text-sm text-orange-500 mb-2"
            onClick={() => setShowDetails((prev) => !prev)}
          >
            {showDetails
              ? "Hide Vehicle & Customer Info"
              : "Show Vehicle & Customer Info"}
          </button>
          {showDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h2 className="font-semibold mb-1">Vehicle Info</h2>
                <p>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </p>
                <p>VIN: {vehicle.vin}</p>
                <p>Mileage: {vehicle.mileage}</p>
                <p>Plate: {vehicle.license_plate}</p>
              </div>
              <div>
                <h2 className="font-semibold mb-1">Customer Info</h2>
<p>
  {[customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "—"}
</p>
<p>{customer?.phone || "—"}</p>
{/* Compose address only if parts exist */}
{(customer?.street || customer?.city || customer?.province || customer?.postal_code) ? (
  <p>
    {[customer?.street, customer?.city, customer?.province, customer?.postal_code]
      .filter(Boolean)
      .join(", ")}
  </p>
) : null}
                
              </div>
            </div>
          )}
        </div>
      )}

      {/* ...rest of your existing JSX stays unchanged from here... */}
      {vehicle?.id && currentUserId && (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-semibold">Vehicle Photos</h2>

          <VehiclePhotoUploader vehicleId={vehicle.id} />
          <VehiclePhotoGallery
            vehicleId={vehicle.id}
            currentUserId={currentUserId}
          />
        </div>
      )}

      {/* rest of your existing JSX stays unchanged from here */}
      {loading ? (
        <div>Loading...</div>
      ) : line ? (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Job: {line.id}</h1>
            <span
              className={`text-sm px-2 py-1 rounded ${statusBadge[line.status as keyof typeof statusBadge]}`}
            >
              {line.status.replace("_", " ")}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <button
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white"
              onClick={() => setIsCauseModalOpen(true)}
            >
              Complete Job
            </button>
            <button
              className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-white"
              onClick={() => setIsPartsModalOpen(true)}
            >
              Request Parts
            </button>
            <button
              className="bg-yellow-500 hover:bg-yellow-600 px-4 py-2 rounded text-white"
              onClick={requestAuthorization}
            >
              Request Authorization
            </button>
            <button
              className="bg-gray-800 hover:bg-black px-4 py-2 rounded text-white col-span-1 sm:col-span-2"
              onClick={() => setIsAddJobModalOpen(true)}
            >
              Add Job
            </button>
          </div>

          <div className="mt-4 p-4 border rounded bg-white dark:bg-gray-900">
            <p>
              <strong>Complaint:</strong> {line.complaint || "—"}
            </p>
            <p>
              <strong>Status:</strong> {line.status}
            </p>
            <p>
              <strong>Live Timer:</strong> {duration}
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
            <p>
              <strong>Labor Time:</strong> {line.labor_time ?? "—"} hrs
            </p>
            <p>
              <strong>Hold Reason:</strong> {line.hold_reason || "—"}
            </p>
          </div>

          <div className="mt-2">
            <button
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-white w-full"
              onClick={handleDownloadQuote}
            >
              Download Quote PDF
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <label className="block font-medium">Tech Notes</label>
            <textarea
              className="w-full border p-2 rounded"
              rows={3}
              value={techNotes}
              onChange={(e) => setTechNotes(e.target.value)}
              onBlur={updateTechNotes}
              disabled={updatingNotes}
            />
          </div>

          <div className="mt-8">
            <h2 className="text-lg font-bold mb-2">Job List</h2>
            <div className="space-y-2">
              {relatedJobs.map((job) => {
                const jobType = job.job_type ?? "unknown";
                const typeColor: Record<string, string> = {
                  diagnosis: "border-l-4 border-red-500",
                  "diagnosis-followup": "border-l-4 border-orange-500",
                  maintenance: "border-l-4 border-yellow-500",
                  repair: "border-l-4 border-green-500",
                  "tech-suggested": "border-l-4 border-blue-400",
                };

                return (
                  <div
                    key={job.id}
                    className={`p-3 border rounded bg-white dark:bg-gray-800 ${typeColor[jobType] || ""}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-semibold">
                          {job.complaint || "No complaint"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {job.job_type || "unknown"} | {job.status}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded ${statusBadge[job.status as keyof typeof statusBadge] || "bg-gray-300 text-gray-800"}`}
                        >
                          {job.status.replace("_", " ")}
                        </span>

                        {activeJobId === null && !job.punched_in_at && (
                          <button
                            className="ml-2 bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                            onClick={() => handlePunchIn(job.id)}
                          >
                            Punch In
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {isPartsModalOpen && line?.work_order_id && (
            <PartsRequestModal
              isOpen={isPartsModalOpen}
              onClose={() => setIsPartsModalOpen(false)}
              jobId={line.id}
              workOrderId={line.work_order_id}
              requested_by={tech?.id || "system"}
            />
          )}

          {isCauseModalOpen && line && (
            <CauseCorrectionModal
              isOpen={isCauseModalOpen}
              onClose={() => setIsCauseModalOpen(false)}
              jobId={line.id}
              onSubmit={handleCompleteJob}
            />
          )}

          {isAddJobModalOpen && line?.work_order_id && line?.vehicle_id && (
            <AddJobModal
              isOpen={isAddJobModalOpen}
              onClose={() => setIsAddJobModalOpen(false)}
              workOrderId={line.work_order_id}
              vehicleId={line.vehicle_id}
              techId={tech?.id || "system"}
              onJobAdded={fetchData}
            />
          )}

          {line.job_type === "diagnosis" &&
            line.punched_in_at &&
            !line.cause &&
            !line.correction &&
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
      ) : (
        <div className="text-red-500">Work order not found.</div>
      )}
    </div>
  );
}
