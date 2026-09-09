/**
 * Canonical technician job-queue rollup.
 *
 * The technician surfaces (desktop Tech Job Queue, mobile My jobs, mobile Home)
 * each used to carry their own copy of these rules, so the same assigned line
 * could be counted in one place and dropped in another. Every technician count
 * must resolve its bucket through this module instead of re-deriving the
 * status list locally.
 */

export type TechnicianJobBucket = "awaiting" | "in_progress" | "on_hold";

export const TECHNICIAN_JOB_BUCKETS: readonly TechnicianJobBucket[] = [
  "in_progress",
  "awaiting",
  "on_hold",
] as const;

export type TechnicianJobLine = {
  status?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
};

function normalizeStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Statuses that close a job out of the technician's queue. A closed job stays
 * on the work order and in performance history; it just stops being work the
 * technician still has to do.
 */
export function isCompletedTechnicianJobStatus(
  status: string | null | undefined,
): boolean {
  const normalized = normalizeStatus(status);
  return (
    normalized === "completed" ||
    normalized === "ready_to_invoice" ||
    normalized === "invoiced"
  );
}

/** An assigned line the technician still owes work on. */
export function isOpenTechnicianJob(line: TechnicianJobLine): boolean {
  return !isCompletedTechnicianJobStatus(line.status);
}

export function toTechnicianJobBucket(
  line: TechnicianJobLine,
): TechnicianJobBucket {
  if (line.punched_in_at && !line.punched_out_at) return "in_progress";

  const status = normalizeStatus(line.status);
  if (status === "in_progress" || status === "active") return "in_progress";
  if (status === "on_hold") return "on_hold";
  return "awaiting";
}

export function countTechnicianJobBuckets(
  lines: readonly TechnicianJobLine[],
): Record<TechnicianJobBucket, number> {
  const counts: Record<TechnicianJobBucket, number> = {
    awaiting: 0,
    in_progress: 0,
    on_hold: 0,
  };
  for (const line of lines) {
    if (!isOpenTechnicianJob(line)) continue;
    counts[toTechnicianJobBucket(line)] += 1;
  }
  return counts;
}
