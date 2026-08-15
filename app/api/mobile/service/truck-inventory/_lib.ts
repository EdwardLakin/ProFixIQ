import { NextResponse } from "next/server";

import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

export type FieldInventoryRpcError = {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: FieldInventoryRpcError | null }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function positiveQuantity(value: unknown): number | null {
  const quantity = typeof value === "number" ? value : Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function optionalUuid(value: unknown): string | null {
  if (value == null || value === "") return null;
  return isUuid(value) ? value.trim() : null;
}

export function operationKey(
  request: Request,
  body: Record<string, unknown>,
): string {
  const header = request.headers.get("idempotency-key")?.trim() ?? "";
  const camel =
    typeof body.operationKey === "string" ? body.operationKey.trim() : "";
  const snake =
    typeof body.operation_key === "string" ? body.operation_key.trim() : "";
  return header || camel || snake;
}

export async function fieldInventoryRpc(
  supabase: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: FieldInventoryRpcError | null }> {
  return (supabase as RpcClient).rpc(name, args);
}

export function fieldInventoryErrorResponse(
  error: FieldInventoryRpcError,
  context: string,
) {
  const safe = toSafeDatabaseError(error, {
    context,
    fallback: "The Field Service inventory operation could not be completed.",
    publicMessagePatterns: [
      /^Authenticated actor mismatch\.?$/i,
      /^Field (?:Service|inventory) access is required\.?$/i,
      /^Parts (?:receiving )?permission is required\.?$/i,
      /^This (?:truck|service visit|service call).*$/i,
      /^The (?:service truck|assigned service truck).*$/i,
      /^A stable operation key is required\.?$/i,
      /^A barcode, provider id, SKU, or part number is required\.?$/i,
      /^Part details are required.*$/i,
      /^Part not found.*$/i,
      /^Purchase order not found.*$/i,
      /^No receivable purchase-order line.*$/i,
      /^Source and truck inventory locations.*$/i,
      /^A transfer location.*$/i,
      /^Insufficient available stock.*$/i,
      /^Arrive at the service call.*$/i,
      /^Create or link the repair.*$/i,
      /^Assign a service truck.*$/i,
      /^The repair line.*$/i,
      /^Work-order part not found.*$/i,
      /^PART_[A-Z0-9_]+$/i,
      /^FIELD_[A-Z0-9_]+$/i,
    ],
  });
  const message = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  const status =
    error.code === "42501"
      ? 403
      : error.code === "P0002"
        ? 404
        : error.code === "22023"
          ? 400
          : error.code === "23505" ||
              error.code === "23514" ||
              error.code === "40001" ||
              error.code === "55000" ||
              /CONFLICT|IN_PROGRESS|INSUFFICIENT|already|outside|assigned/i.test(
                message,
              )
            ? 409
            : safe.isPublicMessage
              ? 400
              : 500;

  return NextResponse.json(
    {
      error: safe.message,
      correlationId: safe.correlationId,
    },
    { status },
  );
}
