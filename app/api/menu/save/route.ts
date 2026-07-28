import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";

type IncomingBody =
  | {
      idempotency_key?: string | null;
      item?: {
        name?: string;
        description?: string | null;
        labor_time?: number | null;
        inspection_template_id?: string | null;
        shop_id?: string | null;
      };
      parts?: Array<{
        name?: string;
        quantity?: number;
        unit_cost?: number;
        part_id?: string | null;
      }>;
    }
  | null;

type CreationResult = {
  ok?: boolean;
  menu_item_id?: string;
  part_request_id?: string | null;
  part_count?: number;
  replayed?: boolean;
};

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function finiteNonNegative(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: [...ALLOWED_ROLES],
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as IncomingBody;
  const name = body?.item?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Service name is required." },
      { status: 400 },
    );
  }
  if (name.length > 180) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Service name is too long." },
      { status: 400 },
    );
  }

  const requestedShopId = body?.item?.shop_id?.trim() || access.profile.shop_id;
  if (requestedShopId !== access.profile.shop_id) {
    return NextResponse.json(
      { ok: false, error: "forbidden", detail: "Shop context does not match." },
      { status: 403 },
    );
  }

  const laborTime = body?.item?.labor_time;
  if (
    laborTime !== null &&
    laborTime !== undefined &&
    finiteNonNegative(laborTime) === null
  ) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Labor time must be zero or greater." },
      { status: 400 },
    );
  }

  const templateId = body?.item?.inspection_template_id?.trim() || null;
  if (templateId && !isUuid(templateId)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Inspection template is invalid." },
      { status: 400 },
    );
  }

  const incomingParts = Array.isArray(body?.parts) ? body.parts : [];
  if (incomingParts.length > 100) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "A menu item can contain at most 100 parts." },
      { status: 400 },
    );
  }

  const parts = incomingParts.map((part) => ({
    name: part.name?.trim() ?? "",
    quantity: part.quantity,
    unit_cost: part.unit_cost,
    part_id: part.part_id?.trim() || null,
  }));
  const invalidPart = parts.find(
    (part) =>
      !part.name ||
      part.name.length > 240 ||
      typeof part.quantity !== "number" ||
      !Number.isFinite(part.quantity) ||
      part.quantity <= 0 ||
      typeof part.unit_cost !== "number" ||
      !Number.isFinite(part.unit_cost) ||
      part.unit_cost < 0 ||
      (part.part_id !== null && !isUuid(part.part_id)),
  );
  if (invalidPart) {
    return NextResponse.json(
      {
        ok: false,
        error: "bad_request",
        detail: "Every part needs a valid name, positive quantity, and non-negative unit cost.",
      },
      { status: 400 },
    );
  }

  const suppliedKey = body?.idempotency_key?.trim() || "";
  if (suppliedKey && !isUuid(suppliedKey)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Creation request key is invalid." },
      { status: 400 },
    );
  }
  const idempotencyKey = suppliedKey || randomUUID();

  const rpc = access.supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: CreationResult | null; error: { message: string } | null }>;

  const { data, error } = await rpc("create_menu_item_with_parts_intake", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_idempotency_key: idempotencyKey,
    p_item: {
      name,
      description: body?.item?.description?.trim() || null,
      labor_time: laborTime ?? null,
      inspection_template_id: templateId,
    },
    p_parts: parts,
  });

  if (error || !data?.ok || !data.menu_item_id) {
    const detail = error?.message ?? "The menu item could not be created.";
    const status = /not authorized|identity|member|available to this shop/i.test(detail)
      ? 403
      : /required|invalid|positive|negative|at most/i.test(detail)
        ? 400
        : 500;
    return NextResponse.json(
      { ok: false, error: "create_failed", detail },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.menu_item_id,
    partRequestId: data.part_request_id ?? null,
    partCount: data.part_count ?? parts.length,
    replayed: Boolean(data.replayed),
  });
}
