"use client";

import { useEffect, useState } from "react";
import type { CsvImportProgressState } from "./CsvImportProgress";

export type ImportJobProgressStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type ImportJobProgressJob = {
  id: string;
  status: ImportJobProgressStatus;
  totalRows: number;
  processedRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage: string | null;
  summary?: unknown;
  updatedAt?: string | null;
};

type ImportJobProgressResponse = {
  ok?: boolean;
  error?: string;
  job?: ImportJobProgressJob;
};

type Options = {
  initialTotal?: number;
  pollMs?: number;
  stalledAfterMs?: number;
  onComplete?: (job: ImportJobProgressJob) => void | Promise<void>;
  onError?: (message: string, job?: ImportJobProgressJob) => void;
};

function percent(processed: number, total: number) {
  if (!total) return processed > 0 ? 1 : 0;
  return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
}

function toProgress(
  job: ImportJobProgressJob,
  initialTotal = 0,
  stalled = false,
): CsvImportProgressState {
  const total = job.totalRows || initialTotal || 0;
  const processed =
    job.status === "completed" && total
      ? Math.max(job.processedRows, total)
      : job.processedRows;
  const calculated = percent(processed, total);
  const phaseKey =
    job.status === "failed"
      ? "failed"
      : job.status === "completed"
        ? "completed"
        : job.status === "queued"
          ? "queued"
          : "processing";
  const phase =
    stalled && (job.status === "queued" || job.status === "processing")
      ? `Still processing… ${job.status}`
      : job.status;

  const summary = job.summary as { duplicates?: number } | null | undefined;

  return {
    phase,
    phaseKey,
    processed,
    total,
    percent: job.status === "completed" ? 100 : calculated,
    imported: job.importedCount,
    skipped: job.skippedCount,
    failed: job.failedCount,
    duplicates: Number(summary?.duplicates ?? 0),
    status: job.status,
    stalled,
  };
}

export function useImportJobProgress(
  jobId: string | null,
  options: Options = {},
) {
  const {
    initialTotal = 0,
    pollMs = 1500,
    stalledAfterMs = 15000,
    onComplete,
    onError,
  } = options;
  const [progress, setProgress] = useState<CsvImportProgressState | null>(null);
  const [lastJob, setLastJob] = useState<ImportJobProgressJob | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const pollingJobId = jobId;
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastMovementAt = Date.now();
    let lastProcessed = -1;

    async function poll() {
      try {
        const res = await fetch(
          `/api/import-jobs/${encodeURIComponent(pollingJobId)}`,
        );
        const payload = (await res
          .json()
          .catch(() => ({}))) as ImportJobProgressResponse;
        if (!res.ok || payload.ok === false || !payload.job)
          throw new Error(payload.error ?? "Unable to load import job status.");
        if (stopped) return;
        const job = payload.job;
        if (job.processedRows !== lastProcessed) {
          lastProcessed = job.processedRows;
          lastMovementAt = Date.now();
        }
        const stalled =
          Date.now() - lastMovementAt >= stalledAfterMs &&
          (job.status === "queued" || job.status === "processing");
        setLastJob(job);
        setProgress(toProgress(job, initialTotal, stalled));
        if (job.status === "completed" || job.status === "failed") {
          if (job.status === "failed")
            onError?.(job.errorMessage ?? "Import job failed.", job);
          await onComplete?.(job);
          return;
        }
        timeoutId = setTimeout(() => void poll(), pollMs);
      } catch (error) {
        if (stopped) return;
        onError?.(
          error instanceof Error
            ? error.message
            : "Unable to poll import status.",
        );
        timeoutId = setTimeout(() => void poll(), pollMs);
      }
    }

    timeoutId = setTimeout(() => void poll(), 500);
    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId, initialTotal, pollMs, stalledAfterMs, onComplete, onError]);

  return { progress, lastJob };
}
