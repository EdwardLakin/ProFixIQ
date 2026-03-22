import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";

const InputSchema = z.object({
  techId: z.string().uuid().optional(),
  techName: z.string().min(1).optional(),
});

type Input = z.infer<typeof InputSchema>;

type Row = {
  id: string;
  work_order_id: string | null;
  assigned_tech_id: string | null;
  status: string | null;
  description: string | null;
  complaint: string | null;
  hold_reason: string | null;
  updated_at: string | null;
  work_orders:
    | {
        id: string;
        custom_id: string | null;
        status: string | null;
      }
    | {
        id: string;
        custom_id: string | null;
        status: string | null;
      }[]
    | null;
};

function getWorkOrderInfo(
  workOrder:
    | {
        id: string;
        custom_id: string | null;
        status: string | null;
      }
    | {
        id: string;
        custom_id: string | null;
        status: string | null;
      }[]
    | null,
) {
  const wo = Array.isArray(workOrder) ? workOrder[0] : workOrder;
  if (!wo) return null;
  return wo;
}

export async function runGetTechCurrentWork(rawInput: Input, ctx: ToolContext) {
  const input = InputSchema.parse(rawInput);
  const supabase = getServerSupabase();

  let techId = input.techId ?? null;

  if (!techId && input.techName) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("shop_id", ctx.shopId)
      .ilike("full_name", `%${input.techName}%`)
      .limit(1)
      .maybeSingle();

    techId = profile?.id ?? null;
  }

  let query = supabase
    .from("work_order_lines")
    .select(
      `
      id,
      work_order_id,
      assigned_tech_id,
      status,
      description,
      complaint,
      hold_reason,
      updated_at,
      work_orders:work_order_id (
        id,
        custom_id,
        status
      )
    `,
    )
    .eq("shop_id", ctx.shopId)
    .in("status", ["awaiting", "awaiting_approval", "queued", "in_progress", "on_hold"])
    .order("updated_at", { ascending: false })
    .limit(25);

  if (techId) {
    query = query.eq("assigned_tech_id", techId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Row[];

  if (rows.length === 0) {
    return {
      ok: true,
      summary: techId
        ? "I couldn’t find active assigned work for that technician."
        : "I couldn’t find active technician work right now.",
      citations: [],
    };
  }

  return {
    ok: true,
    summary: techId
      ? `I found ${rows.length} active job(s) for that technician.`
      : `I found ${rows.length} active job line(s) across technicians.`,
    citations: rows.slice(0, 12).map((row) => {
      const wo = getWorkOrderInfo(row.work_orders);
      return {
        type: "work_order",
        id: row.work_order_id ?? row.id,
        href: row.work_order_id
          ? `/work-orders/${row.work_order_id}/focused-job/${row.id}`
          : `/mobile/jobs/${row.id}`,
        label:
          `${wo?.custom_id ? `WO #${wo.custom_id}` : "Job"} • ` +
          `${row.status ?? "unknown"} • ` +
          `${row.description ?? row.complaint ?? "No description"}`,
      };
    }),
  };
}
