// features/inspections/app/inspection/summary/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

// ✅ use the shared inspections types (not masterInspectionList)
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
    workOrderIdFromUrl || null,
  );
  const [isAddingToWorkOrder, setIsAddingToWorkOrder] = useState(false);

  // Generate AI summary + quote once sections exist
  useEffect(() => {
    if (session.sections.length === 0) return;

    (async () => {
      const allItems: InspectionItem[] = session.sections.flatMap(
        (s: InspectionSection) => s.items,
      );

      const { summary, quote } = await generateQuoteFromInspection(allItems);

      setSummaryText(summary);
      setQuoteLines(quote);

      // ✅ normalize into QuoteLineItem[] for the store (no extra fields)
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

      if (inspectionId) {
        await supabase
          .from("inspections")
          .update({ quote, summary })
          .eq("id", inspectionId);
      }
    })();
  }, [session.sections, inspectionId, supabase, updateQuoteLines]);

  const handleFieldChange = (
    sectionIndex: number,
    itemIndex: number,
    field: keyof InspectionItem,
    value: string,
  ) => {
    // Type-safe update for known fields
    if (field === "status") {
      updateItem(sectionIndex, itemIndex, { status: value as InspectionItem["status"] });
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
        item.status === "fail" || item.status === "recommend",
    ),
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
          created_at: new Date().toISOString(),
          status: "queued", // keep with your schema
          location: (session as any).location ?? "unspecified",
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
    const id = await createWorkOrderIfNoneExists();
    if (!id || !inspectionId) {
      setIsAddingToWorkOrder(false);
      return;
    }

    const response = await fetch("/api/work-orders/from-inspection", {
      method: "POST",
      body: JSON.stringify({
        inspectionId,
        workOrderId: id,
        vehicleId: session.vehicleId,
      }),
    });

    alert(
      response.ok
        ? "Jobs added to work order successfully!"
        : "Failed to add jobs to work order.",
    );
    setIsAddingToWorkOrder(false);
  };

  const handleSubmit = async () => {
    try {
      // generateInspectionPDF returns Uint8Array
      const pdfBytes: Uint8Array = await generateInspectionPDF(session);
      const blob = new Blob([pdfBytes as BlobPart], {
        type: "application/pdf",
      });

      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = "inspection_summary.pdf";
      link.click();

      localStorage.removeItem("inspectionCustomer");
      localStorage.removeItem("inspectionVehicle");

      alert("Inspection submitted and PDF downloaded.");
      router.push("/inspection/menu");
    } catch (error) {
      console.error("Submission error:", error);
      alert("Failed to submit inspection.");
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-between">
        <PreviousPageButton to="/inspection/menu" />
        <HomeButton />
      </div>

      <div className="mb-6 rounded bg-zinc-800 p-4 text-white">
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
          {(session as any).vehicle?.make}{" "}
          {(session as any).vehicle?.model}
        </p>
        <p>VIN: {(session as any).vehicle?.vin}</p>
        <p>License Plate: {(session as any).vehicle?.license_plate}</p>
        <p>Mileage: {(session as any).vehicle?.mileage}</p>
        <p>Color: {(session as any).vehicle?.color}</p>
      </div>

      {/* Editable inspection sections */}
      {session.sections.map(
        (section: InspectionSection, sectionIndex: number) => (
          <div key={sectionIndex} className="mb-6 rounded border">
            <div className="bg-gray-200 px-4 py-2 font-bold">
              {section.title}
            </div>
            <div className="space-y-6 p-4">
              {section.items.map((item: InspectionItem, itemIndex: number) => (
                <div key={itemIndex} className="space-y-2 border-b pb-4">
                  <div className="font-semibold">{item.item ?? (item as any).name}</div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <label className="flex flex-col">
                      Status
                      <select
                        className="rounded border p-1"
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
                        <option value="recommend">Recommend</option>
                      </select>
                    </label>

                    <label className="flex flex-col">
                      Note
                      <input
                        className="rounded border p-1"
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

                    <label className="flex flex-col">
                      Value
                      <input
                        className="rounded border p-1"
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

                    <label className="flex flex-col">
                      Unit
                      <input
                        className="rounded border p-1"
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

                  {Array.isArray(item?.photoUrls) &&
                    item.photoUrls.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.photoUrls.map((url: string, i: number) => (
                          <img
                            key={i}
                            src={url}
                            alt="Uploaded"
                            className="max-h-32 rounded border border-white/20"
                          />
                        ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        ),
      )}

      {/* Quote viewer from AI */}
      {quoteLines.length > 0 && (
        <div className="my-6">
          <QuoteViewer summary={summaryText} quote={quoteLines} />
        </div>
      )}

      {/* Actions */}
      {hasFailedItems && (
        <button
          onClick={handleAddToWorkOrder}
          disabled={isAddingToWorkOrder}
          className="mt-4 w-full rounded-md bg-orange-600 py-3 text-lg font-bold text-white disabled:opacity-60"
        >
          {isAddingToWorkOrder
            ? "Adding to Work Order..."
            : "Add to Work Order"}
        </button>
      )}

      <button
        onClick={handleSubmit}
        className="mt-4 w-full rounded-md bg-green-600 py-3 text-lg font-bold text-white"
      >
        Submit Inspection
      </button>
    </div>
  );
}