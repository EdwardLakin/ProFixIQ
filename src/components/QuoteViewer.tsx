'use client';

import { useState, useEffect } from 'react';
import { updateQuoteLine } from '@lib/supabaseHelpers';
import { generateQuotePDF } from '@lib/work-orders/generateQuotePdf';
import { QuoteLine } from '@lib/quote/generateQuoteFromInspection';
import { QuoteLineItem } from '@lib/inspection/types';
import { searchPartsByKeyword } from '@lib/parts/searchParts';
import { inferPartName } from '@lib/ai/inferPartName';

interface QuoteViewerProps {
  summary: string;
  quote: (QuoteLine | QuoteLineItem)[];
}

async function normalizeQuoteLine(line: QuoteLine | QuoteLineItem): Promise<QuoteLineItem> {
  if ('laborHours' in line && 'price' in line && 'part' in line) {
    return line as QuoteLineItem;
  }

  const fallback = line as QuoteLine;
  const partName = await inferPartName(fallback.description);

  return {
    id: crypto.randomUUID(),
    item: fallback.description,
    name: fallback.description,
    description: fallback.description,
    status: 'fail',
    price: fallback.total,
    partName,
    partPrice: 0,
    part: {
      name: partName,
      price: 0,
    },
    laborHours: fallback.hours,
    photoUrls: [],
    notes: '',
  };
}

export default function QuoteViewer({ summary, quote }: QuoteViewerProps) {
  const [quoteState, setQuoteState] = useState<QuoteLineItem[]>([]);
  const [lookupResults, setLookupResults] = useState<Record<number, string[]>>({});

  useEffect(() => {
    const normalize = async () => {
      const result = await Promise.all(quote.map(normalizeQuoteLine));
      setQuoteState(result);
    };
    normalize();
  }, [quote]);

  const handleChange = (idx: number, field: keyof QuoteLineItem, value: any) => {
    setQuoteState((prev) =>
      prev.map((item, i) =>
        i === idx
          ? {
              ...item,
              [field]: value,
              part:
                field === 'partName'
                  ? { ...item.part, name: value }
                  : field === 'partPrice'
                  ? { ...item.part, price: parseFloat(value) }
                  : item.part,
            }
          : item
      )
    );
  };

  const handlePhotoUpload = (idx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls = Array.from(files).map((file) => URL.createObjectURL(file));
    setQuoteState((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, photoUrls: [...(item.photoUrls || []), ...urls] } : item
      )
    );
  };

  const handlePartSearch = async (idx: number, query: string) => {
    const results = await searchPartsByKeyword(query);
    setLookupResults((prev) => ({ ...prev, [idx]: results }));
  };

  const handleSave = async (item: QuoteLineItem) => {
    try {
      await updateQuoteLine(item);
      alert('Quote line saved!');
    } catch (err) {
      console.error(err);
      alert('Error saving quote line.');
    }
  };

  const handleExportPDF = async () => {
    const blob = await generateQuotePDF(quoteState, summary);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    link.download = 'quote.pdf';
    link.click();
  };

  const grouped: Record<string, QuoteLineItem[]> = {};
  for (const item of quoteState) {
    const group = item.status || 'unknown';
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(item);
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
            const labor = typeof item.price === 'number' ? item.price : 0;
            const partPrice = typeof item.part?.price === 'number' ? item.part.price : 0;

            return (
              <div
                key={item.id}
                className="border border-white/10 bg-white/5 p-4 rounded-md space-y-2"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <input
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/3"
                    value={item.description}
                    onChange={(e) =>
                      handleChange(idx, 'description', e.target.value)
                    }
                    placeholder="Description"
                  />
                  <input
                    type="text"
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/4"
                    value={item.partName}
                    onChange={(e) =>
                      handleChange(idx, 'partName', e.target.value)
                    }
                    onBlur={() => handlePartSearch(idx, item.partName)}
                    placeholder="Part name"
                  />
                  <input
                    type="number"
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/6"
                    value={item.part?.price}
                    onChange={(e) =>
                      handleChange(idx, 'partPrice', e.target.value)
                    }
                    placeholder="Part cost"
                  />
                  <input
                    type="number"
                    className="bg-black/20 text-white p-1 rounded w-full md:w-1/6"
                    value={item.price}
                    onChange={(e) =>
                      handleChange(idx, 'price', parseFloat(e.target.value))
                    }
                    placeholder="Labor price"
                  />
                </div>

                <textarea
                  className="bg-black/20 text-white p-1 rounded w-full"
                  value={item.notes}
                  onChange={(e) =>
                    handleChange(idx, 'notes', e.target.value)
                  }
                  placeholder="Notes"
                />
                  <p className="text-sm text-white/70">
                    Labor: ${labor.toFixed(2)} | Part: ${partPrice.toFixed(2)}
                </p>

                <div className="text-sm text-white/70 mt-2">
                  Suggested Parts:{" "}
                  {lookupResults[idx]?.length
                    ? lookupResults[idx].slice(0, 3).join(', ')
                    : 'None yet'}
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