"use client";

import { useEffect, useState } from "react";
import QuoteViewer from "@/app/components/QuoteViewer";
import { QuoteLineItem } from "@/lib/quote/types";

export default function QuoteReviewPage() {
  const [quote, setQuote] = useState<QuoteLineItem[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);

  // Mocked inspection results (replace with real data or context)
  const inspectionResults = [
    { status: "fail", name: "front brakes", notes: "2mm pad thickness" },
    { status: "recommend", name: "air filter", notes: "" },
  ];

  useEffect(() => {
    const fetchQuote = async () => {
      const res = await fetch("/api/quote", {
        method: "POST",
        body: JSON.stringify({ results: inspectionResults }),
      });
      const data = await res.json();
      setSummary(data.summary);
      setQuote(data.quote);
      setLoading(false);
    };

    fetchQuote();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-white mb-6">Quote Review</h1>

      {loading ? (
        <p className="text-white/70">Loading quote...</p>
      ) : (
        <>
          <QuoteViewer summary={summary} quote={quote} />

          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <button className="bg-orange-600 text-white px-6 py-3 rounded-md font-bold">
              Save to Work Order
            </button>
            <button className="bg-white/10 border border-white/20 text-white px-6 py-3 rounded-md">
              Send to Customer
            </button>
          </div>
        </>
      )}
    </div>
  );
}