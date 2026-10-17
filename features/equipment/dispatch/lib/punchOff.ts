import { z } from "zod";

/**
 * "The last technician to punch off the job closes the line."
 *
 * Cause and correction are only needed from the technician whose punch-off
 * closes the line; earlier punch-offs ignore them. The server decides which
 * case applies, so the client always sends whatever it has collected.
 */
export const PunchOffSchema = z
  .object({
    lineId: z.string().uuid(),
    cause: z.string().trim().max(2000).optional(),
    correction: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export type PunchOffInput = z.infer<typeof PunchOffSchema>;

export type PunchOffResult = {
  ok: true;
  lineId: string;
  lineClosed: boolean;
  remaining: Array<{ technicianId: string; state: "running" | "on_hold" }>;
  idempotent: boolean;
};

/** Plain-language outcome for the technician. */
export function describePunchOff(result: Pick<PunchOffResult, "lineClosed" | "remaining">): string {
  if (result.lineClosed) return "You were the last one on the job. The line is complete.";
  const n = result.remaining.length;
  return n === 1
    ? "Punched off. 1 other technician is still on this job."
    : `Punched off. ${n} other technicians are still on this job.`;
}
