import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };
type RemediationItem = {
  id?: string | null;
  request_id?: string | null;
  description: string;
  qty: number;
  unit_price: number;
  part_number?: string | null;
  manufacturer?: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function twoDecimalNonNegative(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number.NaN;
  if (
    !Number.isFinite(numberValue) ||
    numberValue < 0 ||
    Math.round(numberValue * 100) / 100 !== numberValue
  ) {
    return null;
  }
  return numberValue;
}

function parseItems(value: unknown): RemediationItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return null;
  }

  const items: RemediationItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const description = text(item.description, 500);
    const qty = twoDecimalNonNegative(item.qty);
    const unitPrice = twoDecimalNonNegative(item.unit_price);
    if (!description || qty == null || qty <= 0 || unitPrice == null) {
      return null;
    }
    items.push({
      id: text(item.id, 200),
      request_id: text(item.request_id, 200),
      description,
      qty,
      unit_price: unitPrice,
      part_number: text(item.part_number, 200),
      manufacturer: text(item.manufacturer, 200),
    });
  }
  return items;
}

function statusForError(message: string): number {
  if (message.includes("not found")) return 404;
  if (
    message.includes("TOTAL_MISMATCH") ||
    message.includes("NOT_QUARANTINED") ||
    message.includes("IDEMPOTENCY_CONFLICT")
  ) {
    return 409;
  }
  return 400;
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canEditPricing",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const quoteLineId = id.trim();
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const operationKey = text(
    body?.operationKey ?? request.headers.get("idempotency-key"),
    300,
  );
  const note =
    body?.note == null || body.note === "" ? null : text(body.note, 1000);
  const items = parseItems(body?.items);

  if (!UUID_PATTERN.test(quoteLineId)) {
    return NextResponse.json(
      { error: "Invalid quote line id." },
      { status: 400 },
    );
  }
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable remediation operation key is required." },
      { status: 400 },
    );
  }
  if (body?.note != null && body.note !== "" && note == null) {
    return NextResponse.json(
      { error: "Remediation note must be 1000 characters or fewer." },
      { status: 400 },
    );
  }
  if (!items) {
    return NextResponse.json(
      {
        error:
          "Provide corrected part descriptions, positive quantities, and non-negative sell prices with at most two decimal places.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc(
    "remediate_quote_line_pricing_quarantine",
    {
      p_shop_id: access.profile.shop_id,
      p_quote_line_id: quoteLineId,
      p_actor_user_id: access.authUserId,
      p_items: items,
      p_operation_key: operationKey,
      ...(note ? { p_note: note } : {}),
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json(
      { ok: false, error: message },
      { status: statusForError(message) },
    );
  }

  return NextResponse.json({
    ...(data && typeof data === "object" ? data : { ok: true }),
  });
}
