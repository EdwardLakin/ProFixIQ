"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { generateQuotePDFBytes } from "@work-orders/lib/work-orders/generateQuotePdf";
import type { QuoteLine } from "@quotes/lib/quote/generateQuoteFromInspection";
import type { QuoteLineItem as BaseQuoteLineItem } from "@inspections/lib/inspection/types";
import { searchPartsByKeyword } from "@parts/lib/parts/searchParts";
import { inferPartName } from "@ai/lib/ai/inferPartName";

/** What the UI edits; keep part compatible with your QuoteLineItem type */
type EditableQuoteLineItem = Omit<BaseQuoteLineItem, "part"> & {
  /** allow null while editing */
  part?: { name: string; price: number | null } | null;
  partName: string;
  partPrice?: number | null;
};

interface QuoteViewerProps {
  summary: string;
  quote: (QuoteLine | BaseQuoteLineItem)[];
}

const supabase = createClientComponentClient<Database>();

/** Minimal inline save; adjust table/columns if yours differ */
async function updateQuoteLine(item: EditableQuoteLineItem) {
  const { error } = await supabase
    .from("quote_lines")
    .upsert(
      {
        id: item.id,
        name: item.name ?? item.description ?? "",
        description: item.description ?? "",
        labor_hours: item.laborHours ?? 0,
        parts_cost: item.part?.price ?? item.partPrice ?? 0,
        total_price: item.price ?? 0,
        part_name: item.part?.name ?? item.partName,
        part_price: item.part?.price ?? item.partPrice ?? 0,
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) throw error;
}

async function normalizeQuoteLine(
  line: QuoteLine | BaseQuoteLineItem,
): Promise<EditableQuoteLineItem> {
  if ("laborHours" in line && "price" in line && "part" in line) {
    const li = line as BaseQuoteLineItem;
    const ensuredName = li.part?.name ?? "";
    const ensuredPrice =
      typeof li.part?.price === "number" ? li.part!.price : li.part?.price ?? null;

    return {
      ...li,
      part: { name: ensuredName, price: ensuredPrice },
      partName: ensuredName,
      partPrice: ensuredPrice ?? 0,
    };
  }

  const legacy = line as QuoteLine;
  const inferred = (await inferPartName(legacy.description)) ?? "";

  return {
    id: crypto.randomUUID(),
    item: legacy.description,
    name: legacy.description,
    description: legacy.description,
    status: "fail",
    price: legacy.total,
    laborHours: legacy.hours,
    part: { name: inferred, price: 0 },
    partName: inferred,
    partPrice: 0,
    photoUrls: [],
    notes: "",
  };
}

export default function QuoteViewer({ summary, quote }: QuoteViewerProps) {
  const [quoteState, setQuoteState] = useState<EditableQuoteLineItem[]>([]);
  const [lookupResults, setLookupResults] = useState<Record<number, string[]>>({});

  useEffect(() => {
    (async () => {
      const result = await Promise.all(quote.map(normalizeQuoteLine));
      setQuoteState(result);
    })();
  }, [quote]);

  const handleChange = (
    idx: number,
    field: keyof EditableQuoteLineItem | "partName" | "partPrice",
    value: string | number,
  ) => {
    setQuoteState((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        let next: EditableQuoteLineItem = { ...item, [field]: value as any };
        const ensurePart = () => next.part ?? { name: item.partName ?? "", price: null };

        if (field === "partName") {
          const name = String(value);
          next.partName = name;
          next.part = { ...ensurePart(), name };
        } else if (field === "partPrice") {
          const price = Number(value);
          const safe = Number.isFinite(price) ? price : 0;
          next.partPrice = safe;
          next.part = { ...ensurePart(), price: safe };
        }
        return next;
      }),
    );
  };

  const handlePhotoUpload = (idx: number, files: FileList | null) => {
    if (!files?.length) return;
    const urls = Array.from(files).map((file) => URL.createObjectURL(file));
    setQuoteState((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, photoUrls: [...(item.photoUrls ?? []), ...urls] }
          : item,
      ),
    );
  };

  const handlePartSearch = async (idx: number, query: string) => {
    const results = await searchPartsByKeyword(query);
    setLookupResults((prev) => ({ ...prev, [idx]: results }));
  };

  const handleSave = async (item: EditableQuoteLineItem) => {
    try {
      await updateQuoteLine(item);
      alert("Quote line saved!");
    } catch (err) {
      console.error(err);
      alert("Error saving quote line.");
    }
  };

  const handleExportPDF = async () => {
    const bytes = await generateQuotePDFBytes(quoteState, summary);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "quote.pdf";
    link.click();
  };

  const grouped: Record<string, EditableQuoteLineItem[]> = {};
  for (const item of quoteState) {
    const key = item.status ?? "unknown";
    (grouped[key] ??= []).push(item);
  }

  return (
    <div className="bg-black/30 text-white rounded-lg p-6 shadow-xl backdrop-blur-lg border border-white/10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-orange-400">Inspection Summary</h2>
        <button onClick={handleExportPDF} className="bg-blue-600 px-3 py-1 rounded text-sm">
          Export PDF
        </button>
      </div>

      <pre className="whitespace-pre-wrap text-white/80 mb-6">{summary}</pre>

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="mb-6">
          <h3 className="text-xl font-semibold capitalize text-white mb-2">
            {group} Items
          </h3>

          {items.map((item, idx) => {
            const labor = typeof item.price === "number" ? item.price : 0;
            const partPrice =
              typeof item.partPrice === "number"
                ? item.partPrice
                : typeof item.part?.price === "number"
                  ? item.part.price
                  : 0;

            return (
              <div key={item.id} className="border border-white/10 bg-white/5 p-4 rounded-md space-y-2">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <input
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/3"
                    value={item.description ?? ""}
                    onChange={(e) => handleChange(idx, "description", e.target.value)}
                    placeholder="Description"
                  />
                  <input
                    type="text"
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/4"
                    value={item.partName ?? item.part?.name ?? ""}
                    onChange={(e) => handleChange(idx, "partName", e.target.value)}
                    onBlur={() =>
                      handlePartSearch(idx, (item.partName ?? item.part?.name ?? "").toString())
                    }
                    placeholder="Part name"
                  />
                  <input
                    type="number"
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/6"
                    value={item.partPrice ?? item.part?.price ?? 0}
                    onChange={(e) => handleChange(idx, "partPrice", e.target.value)}
                    placeholder="Part cost"
                  />
                  <input
                    type="number"
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/6"
                    value={item.price ?? 0}
                    onChange={(e) => handleChange(idx, "price", parseFloat(e.target.value))}
                    placeholder="Labor price"
                  />
                </div>

                <textarea
                  className="bg-black/20 text-white p-1 rounded w-full"
                  value={item.notes ?? ""}
                  onChange={(e) => handleChange(idx, "notes", e.target.value)}
                  placeholder="Notes"
                />

                <p className="text-sm text-white/70">
                  Labor: ${labor.toFixed(2)} | Part: ${partPrice.toFixed(2)}
                </p>

                <div className="text-sm text-white/70 mt-2">
                  Suggested Parts:{" "}
                  {lookupResults[idx]?.length
                    ? lookupResults[idx].slice(0, 3).join(", ")
                    : "None yet"}
                </div>

                <input
                  type="file"
                  multiple
                  onChange={(e) => handlePhotoUpload(idx, e.target.files)}
                  className="text-sm"
                />

                <div className="flex flex-wrap gap-2 mt-2">
                  {item.photoUrls?.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      className="max-h-24 border border-white/20 rounded"
                      alt="Quote Attachment"
                    />
                  ))}
                </div>

                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSave(item)}
                    className="bg-green-600 px-4 py-1 rounded text-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="border-t border-white/10 pt-4 text-right text-white font-semibold text-lg">
        Quote Total: $
        {quoteState
          .reduce((sum, i) => sum + (i.price || 0) + (i.part?.price || 0), 0)
          .toFixed(2)}
      </div>
    </div>
  );
}