import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type BodyItem = {
  description: string;
  qty: number;
};

type Body = {
  workOrderId: string;
  jobId?: string | null;
  items: BodyItem[];
  notes?: string | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse + validate
  const body = (await req.json().catch(() => null)) as Body | null;
  if (
    !body ||
    typeof body.workOrderId !== "string" ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json(
      { error: "Invalid body. Expect { workOrderId, items[] }." },
      { status: 400 },
    );
  }

  const workOrderId = body.workOrderId;

  // IMPORTANT: RPC args usually want undefined, not null.
  const jobId =
    typeof body.jobId === "string" && body.jobId.trim().length > 0
      ? body.jobId.trim()
      : undefined;

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : undefined;

  // Normalize items: trim, qty>=1, drop empty descriptions
  const items = body.items
    .map((it) => ({
      description: String(it.description ?? "").trim(),
      qty: Math.max(1, Number(it.qty) || 1),
    }))
    .filter((it) => it.description.length > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: "No valid items." }, { status: 400 });
  }

  // 2) auth (still do this so we return 401 cleanly instead of a DB exception)
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 3) atomic RPC (the “rocket”)
  // Requires SQL function: public.create_part_request_with_items(...)
  type RpcArgs =
    DB["public"]["Functions"]["create_part_request_with_items"]["Args"];

  const args: RpcArgs = {
    p_work_order_id: workOrderId,
    // p_items is json/jsonb in Postgres; supabase types often model it loosely.
    p_items: items as unknown as RpcArgs["p_items"],
    ...(jobId ? { p_job_id: jobId } : {}),
    ...(notes ? { p_notes: notes } : {}),
  };

  const { data, error } = await supabase.rpc(
    "create_part_request_with_items",
    args,
  );

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create part request" },
      { status: 500 },
    );
  }

  return NextResponse.json({ requestId: data });
}