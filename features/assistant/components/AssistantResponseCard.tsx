// features/assistant/components/AssistantResponseCard.tsx

"use client";

import Link from "next/link";
import type { AssistantResponse } from "../types/assistant";
import { buildPlannerHref } from "../lib/buildPlannerHref";

type Props = {
  data: AssistantResponse | { error: string } | null;
};


function fitmentLabel(value: string): string {
  if (value === "confirmed_fit") return "Confirmed fit";
  if (value === "likely_fit") return "Likely fit";
  if (value === "needs_review") return "Needs review";
  return "Unknown fit";
}

function normalizePlannerActionLabel(label: string): string {
  const lower = label.trim().toLowerCase();
  if (!lower || lower.includes("fix") || lower.includes("planner")) {
    return "Plan next steps";
  }
  return label;
}

export default function AssistantResponseCard({ data }: Props) {
  if (!data) return null;

  if ("error" in data) {
    return (
      <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200">
        {data.error}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
      <div className="mb-2 text-xs uppercase text-neutral-400">Direct answer</div>
      <div className="whitespace-pre-line text-sm text-white">{data.summary}</div>

      {data.bullets.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs text-neutral-400">Supporting evidence & context</div>
          <ul className="space-y-1">
            {data.bullets.map((bullet, i) => (
              <li key={`${bullet}-${i}`} className="text-sm text-neutral-200">
                • {bullet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}


      {data.partSuggestions && data.partSuggestions.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="mb-2 text-xs text-neutral-400">Suggested parts (review first)</div>
          {data.partSuggestions.map((part) => (
            <div key={part.candidateId} className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{part.title}</div>
                  <div className="text-xs text-neutral-300">
                    {part.sku ? `${part.sku} • ` : ""}Qty {part.quantitySuggestion} • {fitmentLabel(part.fitmentConfidence)}
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400">rank {Math.round(part.rankScore)}</div>
              </div>
              <div className="mt-2 text-xs text-neutral-300">{part.reviewRecommendation}</div>
              {part.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-300">
                  {part.warnings.slice(0, 2).map((warning) => (
                    <li key={`${part.candidateId}-${warning.type}`}>• {warning.message}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {part.linkedEvidence.slice(0, 3).map((evidence) => (
                  <Link
                    key={evidence.id}
                    href={evidence.href ?? "#"}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-300"
                  >
                    {evidence.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data.relatedRecords && data.relatedRecords.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="mb-2 text-xs text-neutral-400">Related records</div>
          {data.relatedRecords.slice(0, 6).map((record, i) => (
            <div
              key={`${record.label}-${record.href ?? i}`}
              className="rounded-xl border border-white/10 bg-black/40 p-3"
            >
              {record.href ? (
                <Link href={record.href} className="text-sm font-semibold text-orange-200 hover:text-orange-100">
                  {record.label}
                </Link>
              ) : (
                <div className="text-sm font-semibold text-white">{record.label}</div>
              )}
              <div className="text-xs text-neutral-300">
                {record.type ? record.type.replaceAll("_", " ") : "record"}
              </div>
            </div>
          ))}
        </div>
      ) : data.notifications.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="mb-2 text-xs text-neutral-400">Related records</div>
          {data.notifications.slice(0, 3).map((notification, i) => (
            <div
              key={`${notification.code}-${notification.entityId ?? i}`}
              className="rounded-xl border border-white/10 bg-black/40 p-3"
            >
              <div className="text-sm font-semibold text-white">{notification.title}</div>
              <div className="text-xs text-neutral-300">{notification.message}</div>
            </div>
          ))}
        </div>
      ) : null}

      {data.actions.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs text-neutral-400">Suggested next actions</div>
          <div className="flex flex-wrap gap-2">
            {data.actions.map((action, i) =>
              action.kind === "planner" ? (
                <Link
                  key={`${action.label}-${i}`}
                  href={buildPlannerHref(action.plannerPayload)}
                  className="rounded-full border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-xs text-orange-300"
                >
                  {normalizePlannerActionLabel(action.label)}
                </Link>
              ) : (
                <Link
                  key={`${action.href}-${i}`}
                  href={action.href}
                  className="rounded-full border border-orange-400/40 px-3 py-1 text-xs text-orange-300"
                >
                  {action.label}
                </Link>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
