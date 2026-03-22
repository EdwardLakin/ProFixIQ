import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolContext } from "../lib/toolTypes";

const InputSchema = z.object({
  workOrderId: z.string().uuid(),
});

type Input = z.infer<typeof InputSchema>;

function ageHours(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

export async function runGetWorkOrderStatusSummary(
  rawInput: Input,
  ctx: ToolContext,
) {
  const input = InputSchema.parse(rawInput);
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from("work_orders")
    .select(
      `
      id,
      custom_id,
      status,
      created_at,
      updated_at,
      notes,
      work_order_lines (
        id,
        status,
        description,
        complaint,
        hold_reason,
        on_hold_since,
        updated_at
      )
    `,
    )
    .eq("shop_id", ctx.shopId)
    .eq("id", input.workOrderId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Work order not found");
  }

  const lines = Array.isArray(data.work_order_lines) ? data.work_order_lines : [];
  const held = lines.filter((line) => line.status === "on_hold");

  const holdText =
    held.length > 0
      ? held
          .map((line) => {
            const since = line.on_hold_since ?? line.updated_at ?? null;
            const hours = ageHours(since);
            return `${line.description ?? line.complaint ?? line.id}: ${line.hold_reason ?? "No hold reason"}${
              hours != null ? ` (${hours.toFixed(1)}h)` : since ? ` (since ${since})` : ""
            }`;
          })
          .join("; ")
      : "No active hold lines found.";

  const woHours = ageHours(data.updated_at);

  return {
    ok: true,
    summary:
      `Work order ${data.custom_id ? `#${data.custom_id}` : data.id} is ${data.status ?? "unknown status"}` +
      `${woHours != null ? ` and was last updated ${woHours.toFixed(1)} hours ago. ` : ". "}` +
      holdText,
    citations: [
      {
        type: "work_order",
        id: data.id,
        href: `/work-orders/${data.id}`,
        label: data.custom_id ? `WO #${data.custom_id}` : `WO ${data.id.slice(0, 8)}`,
      },
    ],
    notifications:
      held.length > 0
        ? held.map((line) => {
            const since = line.on_hold_since ?? line.updated_at;
            const hours = ageHours(since);
            const level: "warning" | "urgent" =
              hours != null && hours >= 24 ? "urgent" : "warning";

            return {
              level,
              code: "work_order_on_hold_too_long",
              title: "Work order on hold",
              message:
                `${data.custom_id ? `WO #${data.custom_id}` : "Work order"} has a held line: ` +
                `${line.description ?? line.complaint ?? line.id}` +
                `${line.hold_reason ? ` — ${line.hold_reason}` : ""}` +
                `${hours != null ? ` (${hours.toFixed(1)}h)` : ""}`,
              href: `/work-orders/${data.id}/focused-job/${line.id}`,
              entityType: "work_order_line",
              entityId: line.id,
            };
          })
        : [],
  };
}
