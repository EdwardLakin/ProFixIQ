// features/agent/tools/setLineApproval.ts
import { z } from "zod";
import { getServerSupabase } from "../server/supabase";
import type { ToolDef } from "../lib/toolTypes";

export const SetLineApprovalIn = z.object({
  lineId: z.string().uuid(),
  state: z.enum(["approved", "declined"]),
});
export type SetLineApprovalIn = z.infer<typeof SetLineApprovalIn>;

export const SetLineApprovalOut = z.object({
  success: z.boolean(),
});
export type SetLineApprovalOut = z.infer<typeof SetLineApprovalOut>;

export const toolSetLineApproval: ToolDef<SetLineApprovalIn, SetLineApprovalOut> =
  {
    name: "set_line_approval",
    description: "Updates approval_state for a single work order line.",
    inputSchema: SetLineApprovalIn,
    outputSchema: SetLineApprovalOut,
    async run(input, ctx) {
      const supabase = getServerSupabase();

      const { data, error } = await supabase
        .from("work_order_lines")
        .update({ approval_state: input.state })
        .eq("id", input.lineId)
        .eq("shop_id", ctx.shopId)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);

      // If no row matched (wrong shop or bad id), reflect it
      return { success: !!data };
    },
  };