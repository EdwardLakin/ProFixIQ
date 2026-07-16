import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  isPunchEventType,
  type PunchEventType,
} from "@/features/workforce/lib/shift-status";

type Caller = {
  id: string;
  role: string | null;
  shop_id: string | null;
};

function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 10) return false;
  const d = new Date(v);
  return Number.isFinite(d.getTime());
}

type PunchEventTypeDb = PunchEventType;

function isPunchEventTypeDb(v: unknown): v is PunchEventTypeDb {
  return isPunchEventType(v);
}

async function authz() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<Caller>();

  if (meErr || !me || !me.shop_id) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Missing shop" }, { status: 403 }),
    };
  }

  return { ok: true as const, me };
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
  const a = await authz();
  if (!a.ok) return a.res;

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

  const rpc = createServerSupabaseRoute() as unknown as {
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
  const { data, error } = await rpc.rpc("apply_offline_shift_punch_atomic", {
    p_shop_id: a.me.shop_id,
    p_actor_user_id: a.me.id,
    p_operation_key: operationKey,
    p_shift_id: body.shift_id,
    p_event_type: body.event_type,
    p_timestamp: body.timestamp,
    p_note: note,
  });
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
