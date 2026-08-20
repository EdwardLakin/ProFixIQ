import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function getId(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/work-orders\/lines\/([^/]+)\/request-pick$/,
  );
  return match?.[1] ?? null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export async function POST(req: NextRequest) {
  const lineId = getId(req);
  if (!isUuid(lineId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid repair line." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseRoute();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json(
      { ok: false, error: authError.message },
      { status: 500 },
    );
  }
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const rawKey = req.headers.get("Idempotency-Key")?.trim() || "";
  if (!rawKey) {
    return NextResponse.json(
      { ok: false, error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }
  if (rawKey.length > 160) {
    return NextResponse.json(
      { ok: false, error: "Invalid idempotency key." },
      { status: 400 },
    );
  }

  const { data: line, error: lineError } = await supabase
    .from("work_order_lines")
    .select("id, shop_id, work_order_id")
    .eq("id", lineId)
    .maybeSingle<{
      id: string;
      shop_id: string | null;
      work_order_id: string | null;
    }>();

  if (lineError) {
    return NextResponse.json(
      { ok: false, error: lineError.message },
      { status: 500 },
    );
  }
  if (!line?.shop_id || !line.work_order_id) {
    return NextResponse.json(
      { ok: false, error: "Repair line not found." },
      { status: 404 },
    );
  }

  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("parts_request_pick_for_line_atomic", {
    p_work_order_line_id: line.id,
    p_operation_key: `${line.shop_id}:request-pick:${line.id}:${rawKey}`,
  });

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }

  const result =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};

  if (result.requested === false) {
    const reason = String(result.reason ?? "not_required");
    const message =
      reason === "already_staged"
        ? "All approved parts are already staged for this job."
        : reason === "parts_not_approved"
          ? "Parts cannot be picked until this repair line is approved."
          : "There are no approved parts waiting to be picked for this job.";
    return NextResponse.json({ ok: true, requested: false, reason, message });
  }

  return NextResponse.json({
    ok: true,
    requested: true,
    result,
    message: "Parts has been notified to pick and stage this job.",
  });
}
