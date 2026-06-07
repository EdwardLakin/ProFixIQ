"use client";

import { useState } from "react";
import Link from "next/link";

import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";
import { parseCsv, type CsvParseResult } from "@/features/vehicles/lib/importCsv";

type CustomerCsvImportCardProps = {
  className?: string;
  onParsed?: (result: CsvParseResult) => void;
};

const SAMPLE_HEADERS = ["customer_name", "first_name", "last_name", "email", "phone", "street", "city", "state", "zip"];

export function CustomerCsvImportCard({ className = "", onParsed }: CustomerCsvImportCardProps) {
  const [result, setResult] = useState<CsvParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    setError(null);
    setResult(null);
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.headers.length === 0) throw new Error("CSV must include a header row.");
      setResult(parsed);
      onParsed?.(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to parse CSV.");
    }
  }

  return (
    <OnboardingHighlightFrame
      title="Customer CSV import prep"
      description="Preview customer CSV headers before launching the stable owner import workflow. This optional card does not change auth routing or active shop context."
      className={className}
    >
      <div className="space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          className="block w-full rounded-xl border border-slate-700/70 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-full file:border-0 file:bg-orange-400/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-orange-100"
        />
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
          Suggested headers: {SAMPLE_HEADERS.join(", ")}
        </div>
        {error ? <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
        {result ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            Parsed {result.rows.length.toLocaleString()} rows. <Link href="/dashboard/owner/import-customers" className="underline">Continue to import</Link>
          </div>
        ) : null}
      </div>
    </OnboardingHighlightFrame>
  );
}

export default CustomerCsvImportCard;
