"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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

  const { session, updateItem, updateQuoteLines } = useInspectionSession();
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [workOrderId, setWorkOrderId] = useState<string | null>(
    workOrderIdFromUrl || null
  );
  const [isAddingToWorkOrder, setIsAddingToWorkOrder] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const didGenRef = useRef(false);

  useEffect(() => {
    if (didGenRef.current) return;
    if (session.sections.length === 0) return;
    didGenRef.current = true;

    (async () => {
      try {
        const allItems: InspectionItem[] = session.sections.flatMap(
          (s: InspectionSection) => s.items
        );

        // 👇 this is the spot that will complain about missing API key
        const { summary, quote } = await generateQuoteFromInspection(allItems);

        setSummaryText(summary);
        setQuoteLines(quote);

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
            })
          )
        );

        if (inspectionId) {
          await supabase
            .from("inspections")
            .update({ quote, summary })
            .eq("id", inspectionId);
        }
      } catch (err: any) {
        console.error("Quote generation failed:", err);
        // UI-only: show the exact problem
        setAiError(
          err?.message
            ? `AI quote generation error: ${err.message}`
            : "AI quote generation is unavailable (likely missing API key). You can still review and submit the inspection."
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sections.length, inspectionId]);

  const handleFieldChange = (
    sectionIndex: number,
    itemIndex: number,
    field: keyof InspectionItem,
    value: string
  ) => {
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

  const hasFailedItems = session.sections.some((section: InspectionSection) =>
    section.items.some(
      (item: InspectionItem) =>
        item.status === "fail" || item.status === "recommend"
    )
  );

  const createWorkOrderIfNoneExists = async (): Promise<string | null> => {
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
      return null;
    }

    setWorkOrderId(newId);
    return newId;
  };

  const handleAddToWorkOrder = async () => {
    setIsAddingToWorkOrder(true);
    try {
      const id = await createWorkOrderIfNoneExists();
      if (!id || !inspectionId) return;

      const response = await fetch("/api/work-orders/from-inspection", {
        method: "POST",
        body: JSON.stringify({
          inspectionId,
          workOrderId: id,
          vehicleId: session.vehicleId,
        }),
      });

      if (!response.ok) throw new Error("Failed to add jobs to work order.");

      window.dispatchEvent(new CustomEvent("wo:line-added"));
      alert("Jobs added to work order successfully!");
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error ? e.message : "Failed to add jobs to work order."
      );
    } finally {
      setIsAddingToWorkOrder(false);
    }
  };

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

      localStorage.removeItem("inspectionCustomer");
      localStorage.removeItem("inspectionVehicle");

      router.push("/inspection/menu");
    } catch (error) {
      console.error("Submission error:", error);
      alert("Failed to submit inspection.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mb-4 flex justify-between gap-2">
        <PreviousPageButton to="/inspection/menu" />
        <HomeButton />
      </div>

      {aiError && (
        <div className="mb-4 rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {aiError}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-xl font-bold">Customer Info</h2>
        <p>
          Name: {(session as any).customer?.first_name}{" "}
          {(session as any).customer?.last_name}
        </p>
        <p>Phone: {(session as any).customer?.phone}</p>
        <p>Email: {(session as any).customer?.email}</p>

        <h2 className="mb-2 mt-4 text-xl font-bold">Vehicle Info</h2>
        <p>
          Year/Make/Model: {(session as any).vehicle?.year}{" "}
          {(session as any).vehicle?.make} {(session as any).vehicle?.model}
        </p>
        <p>VIN: {(session as any).vehicle?.vin}</p>
        <p>License Plate: {(session as any).vehicle?.license_plate}</p>
        <p>Mileage: {(session as any).vehicle?.mileage}</p>
        <p>Color: {(session as any).vehicle?.color}</p>
      </div>

      {session.sections.map(
        (section: InspectionSection, sectionIndex: number) => (
          <div
            key={sectionIndex}
            className="mb-6 overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="bg-muted px-4 py-2 text-sm font-bold">
              {section.title}
            </div>
            <div className="space-y-6 p-4">
              {section.items.map((item: InspectionItem, itemIndex: number) => (
                <div key={itemIndex} className="space-y-2 border-b border-border/50 pb-4 last:border-b-0 last:pb-0">
                  <div className="font-semibold">
                    {item.item ?? (item as any).name}
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <label className="flex flex-col gap-1 text-sm">
                      Status
                      <select
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                        value={item?.status ?? ""}
                        onChange={(e) =>
                          handleFieldChange(
                            sectionIndex,
                            itemIndex,
                            "status",
                            e.target.value
                          )
                        }
                      >
                        <option value="">Select</option>
                        <option value="ok">OK</option>
                        <option value="fail">Fail</option>
                        <option value="na">N/A</option>
                        <option value="recommend">Recommend</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      Note
                      <input
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                        value={item?.notes || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            sectionIndex,
                            itemIndex,
                            "notes",
                            e.target.value
                          )
                        }
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      Value
                      <input
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                        value={(item?.value as string) || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            sectionIndex,
                            itemIndex,
                            "value",
                            e.target.value
                          )
                        }
                      />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                      Unit
                      <input
                        className="rounded border border-border bg-background px-2 py-1 text-sm"
                        value={item?.unit || ""}
                        onChange={(e) =>
                          handleFieldChange(
                            sectionIndex,
                            itemIndex,
                            "unit",
                            e.target.value
                          )
                        }
                      />
                    </label>
                  </div>

                  {Array.isArray(item?.photoUrls) &&
                    item.photoUrls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.photoUrls.map((url: string, i: number) => (
                          <img
                            key={i}
                            src={url}
                            alt="Uploaded"
                            className="max-h-32 rounded border border-border/60"
                          />
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {quoteLines.length > 0 && (
        <div className="my-6 rounded-lg border border-border bg-card p-4">
          <QuoteViewer summary={summaryText} quote={quoteLines} />
        </div>
      )}

      {hasFailedItems && (
        <button
          onClick={handleAddToWorkOrder}
          disabled={!hasFailedItems || isAddingToWorkOrder}
          className="mt-4 w-full rounded-md bg-orange-600 py-3 text-lg font-bold text-white hover:bg-orange-500 disabled:opacity-60"
        >
          {isAddingToWorkOrder
            ? "Adding to Work Order..."
            : "Add to Work Order"}
        </button>
      )}

      <button
        onClick={handleSubmit}
        disabled={downloading}
        className="mt-4 w-full rounded-md bg-green-600 py-3 text-lg font-bold text-white hover:bg-green-500 disabled:opacity-60"
      >
        {downloading ? "Preparing PDF…" : "Submit Inspection"}
      </button>
    </div>
  );
}