"use client";

import { useState } from "react";

type ReviewItem = {
  id: string;
  severity: string;
  domain?: string | null;
  issue_type?: string;
  summary: string;
  details?: Record<string, unknown>;
};

export function OnboardingReviewPanel({
  reviewCounts,
  reviewItems,
}: {
  reviewCounts: { blocking?: number; high?: number; medium?: number; low?: number; byDomain?: Record<string, number> };
  reviewItems: ReviewItem[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const topItems = reviewItems.filter((item) => item).slice(0, 12);
  const domainCounts = reviewCounts.byDomain ?? {};

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Review exceptions</h3>
      <p className="mt-2 text-sm text-slate-300">
        Blocking: {reviewCounts.blocking ?? 0} • High: {reviewCounts.high ?? 0} • Medium: {reviewCounts.medium ?? 0} • Low: {reviewCounts.low ?? 0}
      </p>

      <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/60 p-3">
        <p className="text-xs uppercase tracking-wide text-slate-400">By domain</p>
        <ul className="mt-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
          {Object.entries(domainCounts).map(([domain, count]) => (
            <li key={domain} className="flex items-center justify-between gap-2 rounded border border-white/5 px-2 py-1">
              <span>{domain}</span>
              <span className="text-white">{count}</span>
            </li>
          ))}
          {Object.keys(domainCounts).length === 0 ? <li className="text-slate-400">No pending exceptions.</li> : null}
        </ul>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">Top grouped exceptions</p>
        {topItems.map((item) => {
          const details = (item.details ?? {}) as Record<string, any>;
          const examples = Array.isArray(details.examples) ? details.examples : [];
          const key = item.id;
          return (
            <div key={item.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {item.severity} • {item.domain ?? "unknown"} • {item.issue_type ?? "issue"}
              </p>
              <p className="text-sm text-white">{item.summary}</p>
              {typeof details.count === "number" ? <p className="text-xs text-slate-300">Affected rows: {details.count}</p> : null}
              {Array.isArray(details.sampleRowIndexes) && details.sampleRowIndexes.length > 0 ? (
                <p className="text-xs text-slate-400">Sample rows: {details.sampleRowIndexes.slice(0, 5).join(", ")}</p>
              ) : null}
              <p className="text-xs text-slate-400">Recommended action: {details.recommendedAction ?? "Review examples and resolve before activation planning."}</p>
              {examples.length > 0 ? (
                <>
                  <button className="mt-2 text-xs text-cyan-200 underline" onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}>
                    {expanded[key] ? "Hide examples" : "Show examples"}
                  </button>
                  {expanded[key] ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {examples.slice(0, 3).map((example: any, idx: number) => (
                        <li key={`${key}-${idx}`}>• {example.summary}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
        {topItems.length === 0 ? <p className="text-xs text-slate-400">No pending review exceptions.</p> : null}
      </div>
    </div>
  );
}
