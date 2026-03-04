import { IntakeV1Schema } from "../schema.zod";
import type { IntakeV1 } from "../types";

/**
 * Placeholder v1.
 * Recommended DB columns on work_orders:
 * - intake_json (jsonb)
 * - intake_status (text)
 * - intake_submitted_at (timestamptz)
 * - intake_submitted_by (uuid)
 */

export async function saveIntakeDraft(args: {
  workOrderId: string;
  intake: IntakeV1;
}) {
  const parsed = IntakeV1Schema.parse(args.intake);
  void parsed;
  throw new Error(
    "Not implemented: update work_orders.intake_json + intake_status='draft'.",
  );
}

export async function submitIntake(args: {
  workOrderId: string;
  intake: IntakeV1;
  submittedBy: string;
}) {
  const parsed = IntakeV1Schema.parse(args.intake);
  void parsed;
  throw new Error(
    "Not implemented: update work_orders.intake_json + intake_status='submitted' + intake_submitted_at/by.",
  );
}
