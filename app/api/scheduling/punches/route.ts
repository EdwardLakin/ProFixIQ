import { NextResponse, type NextRequest } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { WORKFORCE_STAFF_ROLES } from "@/features/workforce/lib/roster";
import {
  isPunchEventType,
  type PunchEventType,
} from "@/features/workforce/lib/shift-status";

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 10) return false;
  const d = new Date(v);
  return Number.isFinite(d.getTime());
}

type PunchEventTypeDb = PunchEventType;

function isPunchEventTypeDb(v: unknown): v is PunchEventTypeDb {
  return isPunchEventType(v);
}

type PunchCreateBody = {
  shift_id?: string;
  event_type?: unknown;
  timestamp?: unknown;
  note?: unknown;
};

export async function POST(req: NextRequest) {
  const operationKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }
  const access = await requireShopScopedApiAccess({
    allowRoles: [...WORKFORCE_STAFF_ROLES],
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as PunchCreateBody | null;
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (!body.shift_id) {
    return NextResponse.json({ error: "Missing shift_id" }, { status: 400 });
  }
  if (!isPunchEventTypeDb(body.event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }
  if (!isIsoDate(body.timestamp)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim()
      : null;
  if (note && note.length > 2000) {
    return NextResponse.json(
      { error: "Punch note must be 2000 characters or fewer." },
      { status: 400 },
    );
  }

  const rpc = access.supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{
      data: unknown;
      error: {
        message: string;
        details?: string | null;
        hint?: string | null;
      } | null;
    }>;
  };
  const { data, error } = await rpc.rpc(
    "apply_canonical_offline_shift_punch_atomic",
    {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_operation_key: operationKey,
    p_shift_id: body.shift_id,
    p_event_type: body.event_type,
    p_timestamp: body.timestamp,
    p_note: note,
    },
  );
  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const normalized = message.toLowerCase();
    const status = normalized.includes("not found")
      ? 404
      : normalized.includes("cannot add") ||
          normalized.includes("not available") ||
          normalized.includes("authenticated actor")
        ? 403
        : normalized.includes("idempotency_key_reuse")
          ? 409
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json(data ?? { ok: true });
}
