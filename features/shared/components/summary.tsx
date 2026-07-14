// features/inspections/app/inspection/summary/page.tsx  (adjust path as needed)
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { extractSummaryFromSession } from "@inspections/lib/inspection/summary";
import type { InspectionSession } from "@inspections/lib/inspection/types";

export default function InspectionSummaryPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Error loading inspection from Supabase:", error.message);
        return;
      }

      const latest = data?.[0];
      if (latest?.result) {
        const result = latest.result as unknown as InspectionSession;
        const items = extractSummaryFromSession(result);
        const summaryText = items
          .map(
            (item) =>
              `• ${item.section} - ${item.item} (${item.status}): ${
                item.notes || "No notes"
              }`,
          )
          .join("\n");
        setSummary(summaryText);
      }
    })();
  }, [supabase]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/inspection/submit", {
        method: "POST",
        body: JSON.stringify({ summary }),
      });

      const data = await res.json();
      if (data.attachedToWorkOrder) {
        router.push("/app/workorders");
      } else if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
    } catch (err) {
      console.error("Submission failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl mb-6 font-bold">Inspection Summary</h1>

        <div className="bg-[color:var(--theme-surface-panel-strong)] shadow-md rounded p-4 space-y-4">
          {summary.split("\n").map((line, index) => (
            <div key={index} className="text-[color:var(--theme-text-muted)]">
              {line.trim().startsWith("•") ? (
                <p className="pl-4">🔹 {line.trim().substring(1).trim()}</p>
              ) : (
                <p className="font-medium">{line.trim()}</p>
              )}
            </div>
          ))}
        </div>

        <button
          className="mt-8 bg-blue-600 text-[color:var(--theme-text-primary)] py-2 px-4 rounded hover:bg-blue-700"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Submitting…" : "Submit Inspection"}
        </button>
      </div>
    </div>
  );
}