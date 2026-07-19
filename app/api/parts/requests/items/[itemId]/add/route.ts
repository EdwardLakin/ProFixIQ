import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const nullableUuid = z.string().uuid().nullable().optional();
const Payload = z.object({
  partId: z.string().uuid(),
  description: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  quotedPrice: z.coerce.number().nonnegative(),
  requestedPartNumber: z.string().trim().nullable().optional(),
  requestedManufacturer: z.string().trim().nullable().optional(),
  workOrderLineId: z.string().uuid(),
  poId: nullableUuid,
  locationId: nullableUuid,
  createAllocation: z.boolean().optional().default(false),
  warningAccepted: z.boolean().optional().default(false),
  warningReason: z.string().trim().nullable().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

type Payload = z.infer<typeof Payload>;

export async function POST(
  req: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  if (!z.string().uuid().safeParse(itemId).success) {
    return NextResponse.json({ ok: false, error: "Invalid itemId." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const json: unknown = await req.json().catch(() => null);
  const parsed = Payload.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const body: Payload = parsed.data;
  if (body.createAllocation && !body.locationId) {
    return NextResponse.json(
      { ok: false, error: "A stock location is required when creating an allocation." },
      { status: 400 },
    );
  }
  if (body.warningAccepted && !body.warningReason) {
    return NextResponse.json(
      { ok: false, error: "A mismatch acknowledgement reason is required." },
      { status: 400 },
    );
  }

  const rawKey =
    body.idempotencyKey || req.headers.get("idempotency-key")?.trim() || "";
  if (!rawKey) {
    return NextResponse.json(
      { ok: false, error: "A stable idempotency key is required." },
      { status: 400 },
    );
  }

  const operationKey = `${access.profile.shop_id}:item-attach:${rawKey}`;
  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("parts_update_attach_allocate_item_atomic", {
    p_shop_id: access.profile.shop_id,
    p_request_item_id: itemId,
    p_part_id: body.partId,
    p_description: body.description,
    p_qty: body.qty,
    p_unit_sell_price: body.quotedPrice,
    p_requested_part_number: body.requestedPartNumber ?? null,
    p_requested_manufacturer: body.requestedManufacturer ?? null,
    p_work_order_line_id: body.workOrderLineId,
    p_po_id: body.poId ?? null,
    p_location_id: body.locationId ?? null,
    p_create_allocation: body.createAllocation,
    p_warning_accepted: body.warningAccepted,
    p_warning_reason: body.warningReason ?? null,
    p_operation_key: operationKey,
    p_actor_user_id: access.profile.id,
  });

  if (error) {
    const message = [error.message, error.details, error.hint].filter(Boolean).join(" — ");
    const status = error.message.includes("FINANCIALLY_LOCKED") ? 409 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const { data: item, error: itemError } = await access.supabase
    .from("part_request_items")
    .select("*")
    .eq("id", itemId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (itemError || !item) {
    return NextResponse.json(
      {
        ok: false,
        error: itemError?.message || "Part was saved, but the refreshed request item could not be loaded.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ...asRecord(data), ok: true, item });
}
