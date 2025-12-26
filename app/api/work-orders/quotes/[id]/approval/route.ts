// app/api/work-orders/quotes/[id]/approval/route.ts
import "server-only";
import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

type Decision = "approved" | "declined";

type DecisionBody = {
  decision: Decision;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // URL shape: /api/work-orders/quotes/:id/approval
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  const workOrderId = segments[segments.length - 2];

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing work order id in URL" },
      { status: 400 },
    );
  }

  let body: DecisionBody;
  try {
    body = (await req.json()) as DecisionBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { decision } = body;

  if (decision !== "approved" && decision !== "declined") {
    return NextResponse.json(
      { error: "decision must be 'approved' or 'declined'" },
      { status: 400 },
    );
  }

  // 1) Get authed portal user
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2) Find the customer row for this user
  const { data: customer, error: customerErr } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<Pick<CustomerRow, "id">>();

  if (customerErr || !customer) {
    return NextResponse.json(
      { error: "Customer account not found for this user" },
      { status: 404 },
    );
  }

  // 3) Make sure the work order belongs to this customer
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, approval_state")
    .eq("id", workOrderId)
    .eq("customer_id", customer.id)
    .maybeSingle<Pick<WorkOrderRow, "id" | "approval_state">>();

  if (woErr || !wo) {
    return NextResponse.json(
      { error: "Work order not found for this customer" },
      { status: 404 },
    );
  }

  const nextApproval: WorkOrderRow["approval_state"] =
    decision === "approved" ? "approved" : "declined";

  // 4) Update approval state + who/when
  const { error: updErr } = await supabase
    .from("work_orders")
    .update({
      approval_state: nextApproval,
      customer_approval_at: new Date().toISOString(),
      customer_approved_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId)
    .eq("customer_id", customer.id);

  if (updErr) {
    return NextResponse.json(
      { error: updErr.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    approval_state: nextApproval,
  });
}