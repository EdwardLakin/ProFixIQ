"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

import useInspectionSession from "@inspections/hooks/useInspectionSession";
import { generateInspectionPDF } from "@inspections/lib/inspection/pdf";
import { generateQuoteFromInspection } from "@quotes/lib/quote/generateQuoteFromInspection";

import QuoteViewer from "@quotes/components/QuoteViewer";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import HomeButton from "@shared/components/ui/HomeButton";

import type {
  InspectionItem,
  InspectionSection,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";
import type { QuoteLine } from "@quotes/lib/quote/generateQuoteFromInspection";

export default function SummaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const inspectionId = searchParams.get("inspectionId");
  const workOrderIdFromUrl = searchParams.get("workOrderId");
  const mode = searchParams.get("mode");
  const isCustomerView = mode === "customer";

  const { session, updateItem, updateQuoteLines } = useInspectionSession();

  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [workOrderId, setWorkOrderId] = useState<string | null>(
    workOrderIdFromUrl || null,
  );
  const [isAddingToWorkOrder, setIsAddingToWorkOrder] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const didGenRef = useRef(false);

  // ---- Derived flags ----
  const hasSections = session.sections && session.sections.length > 0;

  const hasFailedItems = hasSections
    ? session.sections.some((section: InspectionSection) =>
        section.items.some(
          (item: InspectionItem) =>
            item.status === "fail" || item.status === "recommend",
        ),
      )
    : false;

  // ---- AI quote generation on first load with data ----
  useEffect(() => {
    if (didGenRef.current) return;
    if (!hasSections) return;
    didGenRef.current = true;

    (async () => {
      try {
        const allItems: InspectionItem[] = session.sections.flatMap(
          (s: InspectionSection) => s.items,
        );

        const { summary, quote } = await generateQuoteFromInspection(allItems);

        setSummaryText(summary);
        setQuoteLines(quote);

        // Push quote lines into inspection session so they’re editable later
        updateQuoteLines(
          quote.map(
            (line): QuoteLineItem => ({
              id: uuidv4(),
              name: line.description,
              description: line.description,
              notes: "",
              status: "fail",
              laborHours: line.hours ?? 0,
              price: line.total ?? 0,
              part: { name: "", price: 0 },
              photoUrls: [],
            }),
          ),
        );

        // Persist AI output into inspections row if we have an ID
        if (inspectionId) {
          await supabase
            .from("inspections")
            .update({ quote, summary })
            .eq("id", inspectionId);
        }
      } catch (err: any) {
        console.error("Quote generation failed:", err);
        setAiError(
          isCustomerView
            ? "We were unable to generate smart suggestions for this inspection. The results below still reflect the technician’s findings."
            : err?.message
            ? `AI quote generation error: ${err.message}`
            : "AI quote generation is unavailable (likely missing API key). You can still review and submit the inspection.",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSections, inspectionId, isCustomerView]);

  // ---- Field updates (tech/owner only) ----
  const handleFieldChange = (
    sectionIndex: number,
    itemIndex: number,
    field: keyof InspectionItem,
    value: string,
  ) => {
    if (isCustomerView) return; // no edits in customer mode

    if (field === "status") {
      updateItem(sectionIndex, itemIndex, {
        status: value as InspectionItem["status"],
      });
    } else if (field === "notes") {
      updateItem(sectionIndex, itemIndex, { notes: value });
    } else if (field === "value") {
      updateItem(sectionIndex, itemIndex, { value });
    } else if (field === "unit") {
      updateItem(sectionIndex, itemIndex, { unit: value });
    }
  };

  // ---- Work order helpers (internal only) ----
  const createWorkOrderIfNoneExists = async (): Promise<string | null> => {
    if (isCustomerView) return null; // customers never create WOs
    if (workOrderId) return workOrderId;

    const newId = uuidv4();

    const { error } = await supabase
      .from("work_orders")
      .insert([
        {
          id: newId,
          vehicle_id: session.vehicleId ?? null,
          inspection_id: inspectionId ?? null,
          status: "queued",
        } as Database["public"]["Tables"]["work_orders"]["Insert"],
      ]);

    if (error) {
      console.error("Error creating work order:", error);
      toast.error("Failed to create work order.");
      return null;
    }

    setWorkOrderId(newId);
    return newId;
  };

  const handleAddToWorkOrder = async () => {
    if (isCustomerView) return;
    setIsAddingToWorkOrder(true);
    try {
      const id = await createWorkOrderIfNoneExists();
      if (!id || !inspectionId) {
        toast.error("Missing work order or inspection ID.");
        return;
      }

      const response = await fetch("/api/work-orders/import-from-inspection", {
        method: "POST",
        body: JSON.stringify({
          inspectionId,
          workOrderId: id,
          vehicleId: session.vehicleId,
        }),
      });

      if (!response.ok) throw new Error("Failed to add jobs to work order.");

      window.dispatchEvent(new CustomEvent("wo:line-added"));
      toast.success("Jobs added to work order.");
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Failed to add jobs to work order.",
      );
    } finally {
      setIsAddingToWorkOrder(false);
    }
  };

  // ---- Submit / PDF ----
  const handleSubmit = async () => {
    try {
      setDownloading(true);
      const pdfBytes: Uint8Array = await generateInspectionPDF(session);
      const blob = new Blob([pdfBytes as BlobPart], {
        type: "application/pdf",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "inspection_summary.pdf";
      link.click();
      URL.revokeObjectURL(url);

      if (!isCustomerView) {
        // internal flow → clear local storage + return to menu
        localStorage.removeItem("inspectionCustomer");
        localStorage.removeItem("inspectionVehicle");
        router.push("/inspection/menu");
      }
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Failed to generate inspection PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const customer = (session as any).customer;
  const vehicle = (session as any).vehicle;

  return (
    <div
      className={`min-h-screen px-4 pb-24 pt-4 ${
        isCustomerView
          ? "bg-slate-950 text-slate-50"
          : "bg-background text-foreground"
      }`}
    >
      {/* Top nav (hidden for customer view) */}
      {!isCustomerView && (
        <div className="mb-4 flex justify-between gap-2">
          <PreviousPageButton to="/inspection/menu" />
          <HomeButton />
        </div>
      )}

      {/* AI banner */}
      {aiError && (
        <div className="mb-4 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {aiError}
        </div>
      )}

      {/* Summary header card */}
      <div className="mb-4 rounded-xl border border-border bg-card/80 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-orange-400">
              {isCustomerView
                ? "Inspection Report"
                : "Inspection Summary"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isCustomerView
                ? "Here’s a summary of the inspection our technician performed on your vehicle."
                : "Review results, photos, and AI-generated quote before sending to the customer."}
            </p>
          </div>
          {hasFailedItems && (
            <div className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-200">
              {isCustomerView
                ? "Some items need attention"
                : "Issues found — work order recommended"}
            </div>
          )}
        </div>
      </div>

      {/* Customer & Vehicle info */}
      <div className="mb-6 grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-50">
            Customer
          </h2>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Name:{" "}
            </span>
            {customer
              ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`
              : "—"}
          </p>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Phone:{" "}
            </span>
            {customer?.phone || "—"}
          </p>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Email:{" "}
            </span>
            {customer?.email || "—"}
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-50">
            Vehicle
          </h2>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Year / Make / Model:{" "}
            </span>
            {vehicle
              ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${
                  vehicle.model ?? ""
                }`
              : "—"}
          </p>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              VIN:{" "}
            </span>
            {vehicle?.vin || "—"}
          </p>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Plate:{" "}
            </span>
            {vehicle?.license_plate || "—"}
          </p>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Mileage:{" "}
            </span>
            {vehicle?.mileage || "—"}
          </p>
          <p className="text-sm">
            <span className="text-xs uppercase text-muted-foreground">
              Color:{" "}
            </span>
            {vehicle?.color || "—"}
          </p>
        </div>
      </div>

      {/* Sections & items */}
      {hasSections ? (
        session.sections.map(
          (section: InspectionSection, sectionIndex: number) => (
            <div
              key={sectionIndex}
              className="mb-6 overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="bg-muted px-4 py-2 text-sm font-semibold text-neutral-100">
                {section.title}
              </div>
              <div className="space-y-6 p-4">
                {section.items.map(
                  (item: InspectionItem, itemIndex: number) => {
                    const status = item.status ?? "";
                    const statusClass =
                      status === "ok"
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                        : status === "fail"
                        ? "bg-red-500/10 text-red-300 border border-red-500/40"
                        : status === "recommend"
                        ? "bg-amber-500/10 text-amber-200 border border-amber-500/40"
                        : "bg-slate-500/10 text-slate-200 border border-slate-500/40";

                    return (
                      <div
                        key={itemIndex}
                        className="space-y-3 border-b border-border/40 pb-4 last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">
                            {item.item ?? (item as any).name}
                          </div>
                          {status && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusClass}`}
                            >
                              {status.toUpperCase()}
                            </span>
                          )}
                        </div>

                        {isCustomerView ? (
                          // CUSTOMER READ-ONLY LAYOUT
                          <div className="space-y-1 text-xs md:text-sm text-muted-foreground">
                            {item.notes && (
                              <p>
                                <span className="font-semibold text-foreground">
                                  Notes:{" "}
                                </span>
                                {item.notes}
                              </p>
                            )}
                            {(item.value || item.unit) && (
                              <p>
                                <span className="font-semibold text-foreground">
                                  Measurement:{" "}
                                </span>
                                {item.value ?? "—"}{" "}
                                {item.unit ? item.unit : ""}
                              </p>
                            )}
                          </div>
                        ) : (
                          // INTERNAL EDITABLE LAYOUT
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                            <label className="flex flex-col gap-1 text-xs md:text-sm">
                              Status
                              <select
                                className="rounded border border-border bg-background px-2 py-1 text-sm"
                                value={item?.status ?? ""}
                                onChange={(e) =>
                                  handleFieldChange(
                                    sectionIndex,
                                    itemIndex,
                                    "status",
                                    e.target.value,
                                  )
                                }
                              >
                                <option value="">Select</option>
                                <option value="ok">OK</option>
                                <option value="fail">Fail</option>
                                <option value="na">N/A</option>
                                <option value="recommend">
                                  Recommend
                                </option>
                              </select>
                            </label>

                            <label className="flex flex-col gap-1 text-xs md:text-sm">
                              Note
                              <input
                                className="rounded border border-border bg-background px-2 py-1 text-sm"
                                value={item?.notes || ""}
                                onChange={(e) =>
                                  handleFieldChange(
                                    sectionIndex,
                                    itemIndex,
                                    "notes",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>

                            <label className="flex flex-col gap-1 text-xs md:text-sm">
                              Value
                              <input
                                className="rounded border border-border bg-background px-2 py-1 text-sm"
                                value={(item?.value as string) || ""}
                                onChange={(e) =>
                                  handleFieldChange(
                                    sectionIndex,
                                    itemIndex,
                                    "value",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>

                            <label className="flex flex-col gap-1 text-xs md:text-sm">
                              Unit
                              <input
                                className="rounded border border-border bg-background px-2 py-1 text-sm"
                                value={item?.unit || ""}
                                onChange={(e) =>
                                  handleFieldChange(
                                    sectionIndex,
                                    itemIndex,
                                    "unit",
                                    e.target.value,
                                  )
                                }
                              />
                            </label>
                          </div>
                        )}

                        {Array.isArray(item?.photoUrls) &&
                          item.photoUrls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.photoUrls.map(
                                (url: string, i: number) => (
                                  <img
                                    key={i}
                                    src={url}
                                    alt="Uploaded"
                                    className="max-h-32 rounded border border-border/60 object-cover"
                                  />
                                ),
                              )}
                            </div>
                          )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ),
        )
      ) : (
        <div className="mb-6 rounded-xl border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
          No inspection sections found in this session. Go back and start an
          inspection again.
        </div>
      )}

      {/* Quote viewer */}
      {quoteLines.length > 0 && (
        <div className="my-6 rounded-xl border border-border bg-card p-4">
          <QuoteViewer summary={summaryText} quote={quoteLines} />
        </div>
      )}

      {/* Sticky footer actions */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row">
          {!isCustomerView && hasFailedItems && (
            <Button
              variant="default"
              className="w-full bg-orange-600 hover:bg-orange-500"
              onClick={handleAddToWorkOrder}
              disabled={!hasFailedItems || isAddingToWorkOrder}
            >
              {isAddingToWorkOrder
                ? "Adding to work order…"
                : "Add failed items to work order"}
            </Button>
          )}

          <Button
            variant={isCustomerView ? "default" : "outline"}
            className={`w-full ${
              isCustomerView
                ? "bg-green-600 text-white hover:bg-green-500"
                : "border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10"
            }`}
            onClick={handleSubmit}
            disabled={downloading}
          >
            {downloading
              ? "Preparing PDF…"
              : isCustomerView
              ? "Download inspection PDF"
              : "Submit inspection & download PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}