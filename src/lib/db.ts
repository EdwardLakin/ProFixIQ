import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

export const getWorkOrderById = async (id: string) => {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: workOrder, error } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .single();

  const { data: lines, error: linesError } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", id);

  if (error || linesError) {
    throw new Error(
      error?.message || linesError?.message || "Failed to fetch work order",
    );
  }

  return {
    ...workOrder,
    lines: lines || [],
  };
};
