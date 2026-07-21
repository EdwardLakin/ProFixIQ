import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type ReopenResult = {
  ok?: boolean;
  already_open?: boolean;
  inspection_id?: string;
  reopened_at?: string;
  signing_cycle?: number;
};

type ReopenRpcClient = {
  rpc: (
    name: "reopen_inspection",
    args: { p_inspection_id: string; p_reason: string },
  ) => Promise<{
    data: ReopenResult | null;
    error: { message: string } | null;
  }>;
};

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    inspectionId?: unknown;
    reason?: unknown;
  } | null;
  const inspectionId = asString(body?.inspectionId);
  const reason = asString(body?.reason);

  if (!inspectionId || !UUID_RE.test(inspectionId)) {
    return NextResponse.json(
      { error: "A valid inspectionId is required." },
      { status: 400 },
    );
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Reopen reason is required." },
      { status: 400 },
    );
  }

  const { data, error } = await (supabase as unknown as ReopenRpcClient).rpc(
    "reopen_inspection",
    {
      p_inspection_id: inspectionId,
      p_reason: reason,
    },
  );

  if (error) {
    const lower = error.message.toLowerCase();
    const status = lower.includes("only an admin")
      ? 403
      : lower.includes("does not belong")
        ? 403
        : lower.includes("not found")
          ? 404
          : 409;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    alreadyOpen: Boolean(data?.already_open),
    inspectionId: data?.inspection_id ?? inspectionId,
    reopenedAt: data?.reopened_at ?? null,
    signingCycle: data?.signing_cycle ?? 0,
  });
}
