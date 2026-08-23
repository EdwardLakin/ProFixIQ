type AssignTechnicianInput = {
  lineId: string;
  technicianId: string | null;
  action?: AssignmentAction;
  expectedUpdatedAt?: string | null;
  operationKey?: string;
};

export type AssignmentAction =
  | "set_primary"
  | "add_supporting"
  | "remove_supporting"
  | "clear";

type AssignTechnicianResult = {
  ok?: boolean;
  idempotent?: boolean;
  primary_technician_id?: string;
};

type ApiErrorPayload = {
  error?: string;
};

export function createAssignTechnicianOperationKey(
  lineId: string,
  technicianId: string | null,
  action: AssignmentAction = technicianId ? "set_primary" : "clear",
): string {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `assign-technician:${action}:${lineId}:${technicianId ?? "unassigned"}:${randomId}`;
}

export async function assignWorkOrderLineTechnician({
  lineId,
  technicianId,
  action,
  expectedUpdatedAt,
  operationKey,
}: AssignTechnicianInput): Promise<AssignTechnicianResult> {
  const normalizedLineId = lineId.trim();
  const normalizedTechnicianId = technicianId?.trim() || null;
  const normalizedAction = action ?? (normalizedTechnicianId ? "set_primary" : "clear");

  if (!normalizedLineId) {
    throw new Error("A work-order line is required.");
  }
  if (normalizedAction !== "clear" && !normalizedTechnicianId) {
    throw new Error("A technician is required for this assignment action.");
  }

  const normalizedOperationKey =
    operationKey?.trim() ||
    createAssignTechnicianOperationKey(
      normalizedLineId,
      normalizedTechnicianId,
      normalizedAction,
    );

  const response = await fetch("/api/work-orders/assign-line", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": normalizedOperationKey,
    },
    body: JSON.stringify({
      work_order_line_id: normalizedLineId,
      tech_id: normalizedTechnicianId,
      action: normalizedAction,
      expected_updated_at: expectedUpdatedAt?.trim() || null,
      operationKey: normalizedOperationKey,
      idempotencyKey: normalizedOperationKey,
    }),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as (AssignTechnicianResult & ApiErrorPayload) | null;

  if (!response.ok) {
    const error = new Error(
      payload?.error || "Failed to update primary tech.",
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return payload ?? {};
}
