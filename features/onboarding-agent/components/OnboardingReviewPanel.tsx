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

export function groupReviewIssuesForDisplay(reviewItems: ReviewItem[]) {
  return Object.values(
    reviewItems.reduce<Record<string, {
      id: string;
      severity: string;
      domain: string;
      issueType: string;
      summary: string;
      count: number;
      examples: string[];
      detailExamples: Record<string, unknown>[];
    }>>((acc, item) => {
      if (!item) return acc;
      const domain = String(item.domain ?? "unknown");
      const issueType = String(item.issue_type ?? "issue");
      const summary = String(item.summary ?? "Review required");
      const severity = String(item.severity ?? "medium");
      const key = `${domain}|${severity}|${issueType}|${summary}`;
      if (!acc[key]) {
        acc[key] = { id: key, severity, domain, issueType, summary, count: 0, examples: [], detailExamples: [] };
      }
      const bucket = acc[key]!;
      bucket.count += 1;
      if (bucket.examples.length < 3) bucket.examples.push(summary);
      if (bucket.detailExamples.length < 3 && item.details && typeof item.details === "object") bucket.detailExamples.push(item.details);
      return acc;
    }, {}),
  ).sort((a, b) => b.count - a.count).slice(0, 12);
}

export function OnboardingReviewPanel({
  reviewCounts,
  reviewItems,
}: {
  reviewCounts: { blocking?: number; high?: number; medium?: number; low?: number; byDomain?: Record<string, number> };
  reviewItems: ReviewItem[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groupedItems = groupReviewIssuesForDisplay(reviewItems);
  const domainCounts = reviewCounts.byDomain ?? {};

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Review exceptions</h3>
      <p className="mt-2 text-sm text-slate-300">Blocking: {reviewCounts.blocking ?? 0} • High: {reviewCounts.high ?? 0} • Medium: {reviewCounts.medium ?? 0} • Low: {reviewCounts.low ?? 0}</p>

      <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/60 p-3">
        <p className="text-xs uppercase tracking-wide text-slate-400">By domain</p>
        <ul className="mt-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
          {Object.entries(domainCounts).map(([domain, count]) => <li key={domain} className="flex items-center justify-between gap-2 rounded border border-white/5 px-2 py-1"><span>{domain}</span><span className="text-white">{count}</span></li>)}
          {Object.keys(domainCounts).length === 0 ? <li className="text-slate-400">No pending exceptions.</li> : null}
        </ul>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">Grouped review issues</p>
        {groupedItems.map((item) => {
          const key = item.id;
          return (
            <div key={item.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{item.severity} • {item.domain} • {item.issueType}</p>
              <p className="text-sm text-white">{item.summary}</p>
              <p className="text-xs text-slate-300">Count: {item.count}</p>
              <p className="text-xs text-slate-400">Recommended action: manual_review</p>
              {item.examples.length > 0 ? <><button className="mt-2 text-xs text-cyan-200 underline" onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}>{expanded[key] ? "Hide examples" : "Show examples"}</button>{expanded[key] ? <ul className="mt-2 space-y-1 text-xs text-slate-300">{item.examples.slice(0, 3).map((example: string, idx: number) => <li key={`${key}-${idx}`}>• {example}</li>)}</ul> : null}</> : null}
              {expanded[key] && item.detailExamples.length > 0 ? (
                <details className="mt-2 text-[11px] text-slate-400">
                  <summary className="cursor-pointer">Developer details</summary>
                  <pre className="mt-1 overflow-auto rounded bg-slate-950/60 p-2">{JSON.stringify(item.detailExamples, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          );
        })}
        {groupedItems.length === 0 ? <p className="text-xs text-slate-400">No pending review exceptions.</p> : null}
      </div>
    </div>
  );
}
