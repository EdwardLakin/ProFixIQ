import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

import type { Database } from "@shared/types/types/supabase";
import type { PlannerProposal } from "@/features/agent/lib/plannerProposal";
import { runRescheduleBooking, runSetLineApproval, runAddWorkOrderLine } from "@/features/agent/lib/toolRegistry";

const ApplyBodySchema = z.object({
  runId: z.string().uuid(),
  proposalId: z.string().min(3),
  confirmationToken: z.literal("CONFIRM_APPLY"),
  applyKey: z.string().min(8),
});

type DB = Database;

function asProposal(value: unknown): PlannerProposal | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { proposal?: unknown };
  if (!candidate.proposal || typeof candidate.proposal !== "object") return null;
  return candidate.proposal as PlannerProposal;
}

async function resolveShopId(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("shop_id").eq("id", userId).maybeSingle();
  return data?.shop_id ?? null;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shopId = await resolveShopId(supabase, user.id);
  if (!shopId) return NextResponse.json({ error: "No shop found" }, { status: 400 });

  const raw = await req.json().catch(() => null);
  const parsed = ApplyBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }

  const { runId, proposalId, applyKey } = parsed.data;

  const { data: run } = await supabase
    .from("planner_runs")
    .select("id, shop_id, user_id")
    .eq("id", runId)
    .maybeSingle();

  if (!run || run.shop_id !== shopId) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const { data: existingApply } = await supabase
    .from("planner_events")
    .select("id")
    .eq("run_id", runId)
    .eq("kind", "proposal.apply")
    .contains("content", { proposalId, applyKey })
    .limit(1);

  if ((existingApply ?? []).length > 0) {
    return NextResponse.json({ error: "This apply key was already used." }, { status: 409 });
  }

  const { data: proposalEvents } = await supabase
    .from("planner_events")
    .select("step, content")
    .eq("run_id", runId)
    .eq("kind", "proposal")
    .order("step", { ascending: false })
    .limit(50);

  const proposal = (proposalEvents ?? [])
    .map((event) => asProposal(event.content))
    .find((item) => item?.id === proposalId);

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found for run." }, { status: 404 });
  }

  if (proposal.classification !== "confirmable_write" || !proposal.execution_available) {
    return NextResponse.json({ error: "This proposal is not executable." }, { status: 400 });
  }

  const payload = proposal.execution_payload;
  if (!payload) {
    return NextResponse.json({ error: "Execution payload missing." }, { status: 400 });
  }

  const changedRecords: PlannerProposal["affected_records"] = [];
  const resultLinks: PlannerProposal["result_links"] = [];
  const failures: string[] = [];

  try {
    if (payload.action === "set_line_approval") {
      const lineId = String(payload.data.lineId ?? "");
      const approvalAction = String(payload.data.approvalAction ?? "approve");
      const state = approvalAction === "reject" ? "declined" : "approved";
      await runSetLineApproval({ lineId, state }, { shopId, userId: user.id });
      changedRecords.push({
        type: "work_order_line",
        id: lineId,
        href: "#",
        label: `Line ${lineId.slice(0, 8)} set ${state}`,
      });
    } else if (payload.action === "reschedule_booking") {
      const bookingId = String(payload.data.bookingId ?? "");
      const startsAt = String(payload.data.requestedStart ?? "");
      const endsAt = payload.data.requestedEnd ? String(payload.data.requestedEnd) : undefined;
      await runRescheduleBooking({ bookingId, startsAt, endsAt }, { shopId, userId: user.id });
      changedRecords.push({
        type: "booking",
        id: bookingId,
        href: `/calendar?bookingId=${bookingId}`,
        label: `Booking ${bookingId.slice(0, 8)} moved`,
      });
      resultLinks.push({ href: `/calendar?bookingId=${bookingId}`, label: "Open booking" });
    } else if (payload.action === "add_work_order_line") {
      const workOrderId = String(payload.data.workOrderId ?? "");
      const description = String(payload.data.lineDescription ?? "");
      const jobType = String(payload.data.jobType ?? "repair") as "maintenance" | "repair" | "diagnosis" | "inspection";
      const laborHours = Number(payload.data.laborHours ?? 1);
      const created = await runAddWorkOrderLine(
        {
          workOrderId,
          description,
          jobType,
          laborHours,
        },
        { shopId, userId: user.id },
      );
      changedRecords.push({
        type: "work_order_line",
        id: created.lineId,
        href: `/work-orders/${workOrderId}`,
        label: `Line ${created.lineId.slice(0, 8)} added`,
      });
      resultLinks.push({ href: `/work-orders/${workOrderId}`, label: "Open work order" });
    } else {
      return NextResponse.json({ error: "Unsupported execution action." }, { status: 400 });
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const status = failures.length > 0 ? (changedRecords.length > 0 ? "partial" : "failed") : "success";
  const summary =
    status === "success"
      ? `Execution result: ${changedRecords.length} change(s) applied.`
      : status === "partial"
        ? `Execution partially applied with ${failures.length} failure(s).`
        : "Execution failed. No changes were confirmed.";

  const executionResult = {
    status,
    summary,
    changed_records: changedRecords,
    result_links: resultLinks,
    failures,
    audit_ref: `${runId}:${proposalId}:${applyKey}`,
    applied_at: new Date().toISOString(),
  };

  await supabase.from("planner_events").insert({
    run_id: runId,
    step: (proposalEvents?.[0]?.step ?? 0) + 1,
    kind: "proposal.apply",
    content: {
      proposalId,
      applyKey,
      result: executionResult,
    },
  });

  return NextResponse.json({
    proposalId,
    result: executionResult,
  });
}
