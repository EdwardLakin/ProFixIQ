import crypto from "crypto";

import type { OperationalStoryCandidate, ProFixIQStoryEvent } from "../types";

function clipText(value: string, max = 220): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function resolveHeadline(candidate: OperationalStoryCandidate): string {
  const map: Record<OperationalStoryCandidate["candidateType"], string> = {
    shop_completed_jobs_today: "Shop throughput signal",
    top_technician_today: "Top technician signal",
    fastest_turnaround_today: "Fast turnaround signal",
    busiest_period_today: "Peak completion window signal",
    high_shop_utilization_streak: "High utilization signal",
    overload_recovery_throughput_improvement: "Throughput recovery signal",
  };

  return map[candidate.candidateType] ?? "Operational signal";
}

function toTechnicianSummary(candidate: OperationalStoryCandidate): string {
  const utilization = candidate.metricBasis.utilizationPct;
  const completed = candidate.metricBasis.completedJobsToday;
  const improvement = candidate.metricBasis.improvementPct;

  const parts: string[] = [clipText(candidate.summary, 180)];

  if (typeof utilization === "number") {
    parts.push(`Utilization: ${Math.round(utilization)}%.`);
  }

  if (typeof completed === "number") {
    parts.push(`Completed jobs: ${Math.round(completed)}.`);
  }

  if (typeof improvement === "number") {
    parts.push(`Throughput trend: +${Math.round(improvement)}%.`);
  }

  return parts.join(" ");
}

export function mapOperationalStoryCandidateToStoryEvent(
  candidate: OperationalStoryCandidate,
): ProFixIQStoryEvent {
  const generatedAt = candidate.generatedAt || new Date().toISOString();

  return {
    eventId: crypto.randomUUID(),
    eventType: "operations.signal",
    occurredAt: generatedAt,
    source: {
      app: "profixiq",
      shopId: candidate.source.shopId,
      locationId: null,
    },
    subject: {
      workOrderId: null,
      workOrderNumber: null,
      inspectionId: null,
      vehicleId: null,
      customerLabel: "Shop Operations",
      vehicleLabel: null,
    },
    storyData: {
      headline: resolveHeadline(candidate),
      summary: clipText(candidate.summary),
      findings: [
        {
          label: `Opportunity score ${Math.round(candidate.opportunityScore)} · confidence ${Math.round(candidate.confidence * 100)}%`,
          status: "info",
          category: "operations",
        },
      ],
      services: (candidate.tags ?? []).slice(0, 3).map((tag) => ({
        label: tag,
        kind: "diagnostic",
      })),
      media: [],
      approvalStatus: null,
      technicianSummary: toTechnicianSummary(candidate),
    },
    privacy: {
      containsSensitiveData: false,
      redactionsApplied: ["customer", "vehicle", "pricing"],
    },
  };
}
