import crypto from "crypto";

import { getTechnicianLoadMetricsWithClient } from "@shared/lib/stats/getTechnicianLoadMetricsCore";

import type {
  OperationalStoryCandidate,
  OperationalStoryCandidateKind,
  OperationalStoryMetricBasis,
} from "../types";
import { createAdminClient } from "./createAdminClient";

type CompletedLineRow = {
  id: string;
  assigned_tech_id: string | null;
  punched_in_at: string | null;
  punched_out_at: string | null;
};

type ActiveLineRow = {
  id: string;
  punched_in_at: string | null;
};

type ThroughputTrend = {
  earlyWindowCompletions: number;
  recentWindowCompletions: number;
  improvementPct: number;
};

function localDateParts(iso: string, timezone: string): { dateKey: string; hour24: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  return {
    dateKey: `${year}-${month}-${day}`,
    hour24: Number.isFinite(hour) ? hour : 0,
  };
}

function hourLabel(hour24: number): string {
  const normalized = ((hour24 % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${hour12}:00 ${suffix}`;
}

function durationMinutes(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  return Math.round((endMs - startMs) / (1000 * 60));
}

function pushCandidate(args: {
  candidates: OperationalStoryCandidate[];
  shopId: string;
  timezone: string;
  generatedAt: string;
  dayStartIso: string;
  dayEndIso: string;
  kind: OperationalStoryCandidateKind;
  summary: string;
  basis: OperationalStoryMetricBasis;
  confidence?: number;
  score?: number;
  tags?: string[];
}): void {
  args.candidates.push({
    candidateId: crypto.randomUUID(),
    candidateType: args.kind,
    generatedAt: args.generatedAt,
    source: {
      app: "profixiq",
      shopId: args.shopId,
      timezone: args.timezone,
      windowStart: args.dayStartIso,
      windowEnd: args.dayEndIso,
    },
    summary: args.summary,
    metricBasis: args.basis,
    confidence: args.confidence ?? 0.72,
    opportunityScore: args.score ?? 55,
    tags: args.tags ?? [],
  });
}

function buildThroughputTrend(lines: CompletedLineRow[]): ThroughputTrend {
  if (lines.length === 0) {
    return {
      earlyWindowCompletions: 0,
      recentWindowCompletions: 0,
      improvementPct: 0,
    };
  }

  const ordered = [...lines]
    .map((line) => ({
      ...line,
      punchedOutMs: line.punched_out_at ? new Date(line.punched_out_at).getTime() : 0,
    }))
    .filter((line) => Number.isFinite(line.punchedOutMs) && line.punchedOutMs > 0)
    .sort((a, b) => a.punchedOutMs - b.punchedOutMs);

  if (ordered.length === 0) {
    return {
      earlyWindowCompletions: 0,
      recentWindowCompletions: 0,
      improvementPct: 0,
    };
  }

  const midpoint = Math.ceil(ordered.length / 2);
  const earlyWindowCompletions = ordered.slice(0, midpoint).length;
  const recentWindowCompletions = ordered.slice(midpoint).length;

  if (earlyWindowCompletions === 0) {
    return {
      earlyWindowCompletions,
      recentWindowCompletions,
      improvementPct: recentWindowCompletions > 0 ? 100 : 0,
    };
  }

  return {
    earlyWindowCompletions,
    recentWindowCompletions,
    improvementPct: Math.round(
      ((recentWindowCompletions - earlyWindowCompletions) / earlyWindowCompletions) * 100,
    ),
  };
}

export async function buildOperationalStoryCandidatesForShop(
  shopId: string,
): Promise<OperationalStoryCandidate[]> {
  const supabase = createAdminClient();

  const loadMetrics = await getTechnicianLoadMetricsWithClient(supabase, shopId);
  const generatedAt = new Date().toISOString();

  const techIds = loadMetrics.rows.map((row) => row.techId).filter(Boolean);

  if (techIds.length === 0) {
    return [];
  }

  const [completedLinesRes, activeLinesRes] = await Promise.all([
    supabase
      .from("work_order_lines")
      .select("id, assigned_tech_id, punched_in_at, punched_out_at")
      .eq("shop_id", shopId)
      .in("assigned_tech_id", techIds)
      .gte("punched_out_at", loadMetrics.dayStartIso)
      .lt("punched_out_at", loadMetrics.dayEndIso),
    supabase
      .from("work_order_lines")
      .select("id, punched_in_at")
      .eq("shop_id", shopId)
      .in("assigned_tech_id", techIds)
      .lt("punched_in_at", loadMetrics.dayEndIso)
      .is("punched_out_at", null),
  ]);

  if (completedLinesRes.error) throw completedLinesRes.error;
  if (activeLinesRes.error) throw activeLinesRes.error;

  const completedLines = (completedLinesRes.data as CompletedLineRow[] | null) ?? [];
  const activeLines = (activeLinesRes.data as ActiveLineRow[] | null) ?? [];

  const candidates: OperationalStoryCandidate[] = [];

  const completedJobsToday = loadMetrics.rows.reduce((sum, row) => sum + row.completedJobsToday, 0);

  if (completedJobsToday > 0) {
    pushCandidate({
      candidates,
      shopId,
      timezone: loadMetrics.timezone,
      generatedAt,
      dayStartIso: loadMetrics.dayStartIso,
      dayEndIso: loadMetrics.dayEndIso,
      kind: "shop_completed_jobs_today",
      summary: `Shop completed ${completedJobsToday} job${completedJobsToday === 1 ? "" : "s"} today.`,
      basis: {
        localDayKey: loadMetrics.localDayKey,
        completedJobsToday,
        activeTechnicians: loadMetrics.summary.activeTechnicians,
        totalTechnicians: loadMetrics.summary.totalTechnicians,
      },
      confidence: 0.9,
      score: Math.min(92, 50 + completedJobsToday * 3),
      tags: ["ops", "throughput", "daily-win"],
    });
  }

  const topTech = [...loadMetrics.rows]
    .filter((row) => row.completedJobsToday > 0)
    .sort((a, b) => {
      if (b.completedJobsToday !== a.completedJobsToday) {
        return b.completedJobsToday - a.completedJobsToday;
      }
      return a.avgJobDurationSeconds - b.avgJobDurationSeconds;
    })[0];

  if (topTech) {
    pushCandidate({
      candidates,
      shopId,
      timezone: loadMetrics.timezone,
      generatedAt,
      dayStartIso: loadMetrics.dayStartIso,
      dayEndIso: loadMetrics.dayEndIso,
      kind: "top_technician_today",
      summary: `${topTech.name} led the shop today with ${topTech.completedJobsToday} completed job${topTech.completedJobsToday === 1 ? "" : "s"}.`,
      basis: {
        localDayKey: loadMetrics.localDayKey,
        technicianId: topTech.techId,
        technicianName: topTech.name,
        completedJobsToday: topTech.completedJobsToday,
        avgJobDurationSeconds: topTech.avgJobDurationSeconds,
        utilizationPct: topTech.utilizationPct,
      },
      confidence: 0.86,
      score: Math.min(88, 45 + topTech.completedJobsToday * 5),
      tags: ["ops", "technician", "leaderboard"],
    });
  }

  const fastestTech = [...loadMetrics.rows]
    .filter((row) => row.completedJobsToday > 0 && row.avgJobDurationSeconds > 0)
    .sort((a, b) => a.avgJobDurationSeconds - b.avgJobDurationSeconds)[0];

  if (fastestTech) {
    const avgMinutes = Math.round(fastestTech.avgJobDurationSeconds / 60);

    pushCandidate({
      candidates,
      shopId,
      timezone: loadMetrics.timezone,
      generatedAt,
      dayStartIso: loadMetrics.dayStartIso,
      dayEndIso: loadMetrics.dayEndIso,
      kind: "fastest_turnaround_today",
      summary: `${fastestTech.name} posted the fastest average turnaround today at ${avgMinutes} minutes per completed job.`,
      basis: {
        localDayKey: loadMetrics.localDayKey,
        technicianId: fastestTech.techId,
        technicianName: fastestTech.name,
        completedJobsToday: fastestTech.completedJobsToday,
        avgJobDurationSeconds: fastestTech.avgJobDurationSeconds,
      },
      confidence: 0.79,
      score: Math.min(84, 40 + fastestTech.completedJobsToday * 4),
      tags: ["ops", "turnaround", "efficiency"],
    });
  }

  const hourlyCompletions = new Map<string, { dateKey: string; hour24: number; count: number }>();

  for (const line of completedLines) {
    if (!line.punched_out_at) continue;

    const { dateKey, hour24 } = localDateParts(line.punched_out_at, loadMetrics.timezone);
    const key = `${dateKey}-${hour24}`;

    const bucket = hourlyCompletions.get(key) ?? { dateKey, hour24, count: 0 };
    bucket.count += 1;
    hourlyCompletions.set(key, bucket);
  }

  const busiestBucket = [...hourlyCompletions.values()].sort((a, b) => b.count - a.count)[0];

  if (busiestBucket && busiestBucket.count > 0) {
    pushCandidate({
      candidates,
      shopId,
      timezone: loadMetrics.timezone,
      generatedAt,
      dayStartIso: loadMetrics.dayStartIso,
      dayEndIso: loadMetrics.dayEndIso,
      kind: "busiest_period_today",
      summary: `Busiest completion window was around ${hourLabel(busiestBucket.hour24)} with ${busiestBucket.count} job${busiestBucket.count === 1 ? "" : "s"} completed.`,
      basis: {
        localDayKey: loadMetrics.localDayKey,
        dateKey: busiestBucket.dateKey,
        busiestHour24: busiestBucket.hour24,
        completionsInHour: busiestBucket.count,
        completedJobsToday,
      },
      confidence: 0.82,
      score: Math.min(86, 44 + busiestBucket.count * 4),
      tags: ["ops", "tempo", "peak-window"],
    });
  }

  const oldestActive = [...activeLines]
    .filter((line) => line.punched_in_at)
    .sort(
      (a, b) =>
        new Date(a.punched_in_at as string).getTime() - new Date(b.punched_in_at as string).getTime(),
    )[0];

  if (
    loadMetrics.summary.shopUtilizationPct >= 85 &&
    loadMetrics.summary.totalActiveJobs >= 2 &&
    oldestActive?.punched_in_at
  ) {
    const streakMinutes = durationMinutes(oldestActive.punched_in_at, generatedAt);

    pushCandidate({
      candidates,
      shopId,
      timezone: loadMetrics.timezone,
      generatedAt,
      dayStartIso: loadMetrics.dayStartIso,
      dayEndIso: loadMetrics.dayEndIso,
      kind: "high_shop_utilization_streak",
      summary: `Shop utilization is holding at ${loadMetrics.summary.shopUtilizationPct}% with ${loadMetrics.summary.totalActiveJobs} active jobs (high-load streak ~${streakMinutes} minutes).`,
      basis: {
        localDayKey: loadMetrics.localDayKey,
        shopUtilizationPct: loadMetrics.summary.shopUtilizationPct,
        totalActiveJobs: loadMetrics.summary.totalActiveJobs,
        totalTechnicians: loadMetrics.summary.totalTechnicians,
        streakMinutes,
        oldestActiveJobStartedAt: oldestActive.punched_in_at,
      },
      confidence: 0.75,
      score: Math.min(90, 50 + Math.round(loadMetrics.summary.shopUtilizationPct / 2)),
      tags: ["ops", "capacity", "high-utilization"],
    });
  }

  const trend = buildThroughputTrend(completedLines);

  if (
    trend.recentWindowCompletions > trend.earlyWindowCompletions &&
    trend.improvementPct >= 25 &&
    loadMetrics.summary.shopUtilizationPct <= 88
  ) {
    pushCandidate({
      candidates,
      shopId,
      timezone: loadMetrics.timezone,
      generatedAt,
      dayStartIso: loadMetrics.dayStartIso,
      dayEndIso: loadMetrics.dayEndIso,
      kind: "overload_recovery_throughput_improvement",
      summary: `Throughput improved by ${trend.improvementPct}% in the most recent work window (${trend.recentWindowCompletions} completions vs ${trend.earlyWindowCompletions} earlier), indicating overload recovery.`,
      basis: {
        localDayKey: loadMetrics.localDayKey,
        earlyWindowCompletions: trend.earlyWindowCompletions,
        recentWindowCompletions: trend.recentWindowCompletions,
        improvementPct: trend.improvementPct,
        shopUtilizationPct: loadMetrics.summary.shopUtilizationPct,
      },
      confidence: 0.74,
      score: Math.min(87, 48 + trend.improvementPct / 2),
      tags: ["ops", "recovery", "throughput"],
    });
  }

  return candidates.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
