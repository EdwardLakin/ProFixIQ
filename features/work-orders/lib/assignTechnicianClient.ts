type AssignTechnicianInput = {
  lineId: string;
  technicianId: string;
  operationKey?: string;
};

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
  technicianId: string,
): string {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `assign-technician:${lineId}:${technicianId}:${randomId}`;
}

export async function assignWorkOrderLineTechnician({
  lineId,
  technicianId,
  operationKey,
}: AssignTechnicianInput): Promise<AssignTechnicianResult> {
  const normalizedLineId = lineId.trim();
  const normalizedTechnicianId = technicianId.trim();

  if (!normalizedLineId || !normalizedTechnicianId) {
    throw new Error("A work-order line and technician are required.");
  }

  const normalizedOperationKey =
    operationKey?.trim() ||
    createAssignTechnicianOperationKey(
      normalizedLineId,
      normalizedTechnicianId,
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
