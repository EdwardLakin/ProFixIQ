import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type MenuRepairItemLite = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  "id" | "shop_id" | "source_work_order_line_id" | "template_key" | "name" | "complaint"
>;

type WorkOrderLineLite = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "shop_id" | "description" | "complaint"
>;

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function compactKeyPart(v: unknown): string {
  return (
    safeTrim(v)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "na"
  );
}

export async function findMenuRepairItemForWorkOrderLine(args: {
  supabase: SupabaseClient<DB>;
  workOrderLineId: string;
}): Promise<string | null> {
  const { supabase, workOrderLineId } = args;

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, shop_id, description, complaint")
    .eq("id", workOrderLineId)
    .maybeSingle<WorkOrderLineLite>();

  if (lineErr) throw lineErr;
  if (!line?.id || !line.shop_id) return null;

  const direct = await supabase
    .from("menu_repair_items")
    .select("id, shop_id, source_work_order_line_id, template_key, name, complaint")
    .eq("shop_id", line.shop_id)
    .eq("source_work_order_line_id", line.id)
    .maybeSingle<MenuRepairItemLite>();

  if (direct.error) throw direct.error;
  if (direct.data?.id) return direct.data.id;

  const fallbackName = safeTrim(line.description) || safeTrim(line.complaint);
  if (!fallbackName) return null;

  const fallbackKey = [
    line.shop_id,
    "na",
    "na",
    "na",
    "na",
    "na",
    "na",
    compactKeyPart(fallbackName),
  ].join("::");

  const fallback = await supabase
    .from("menu_repair_items")
    .select("id, shop_id, source_work_order_line_id, template_key, name, complaint")
    .eq("shop_id", line.shop_id)
    .eq("template_key", fallbackKey)
    .maybeSingle<MenuRepairItemLite>();

  if (fallback.error) throw fallback.error;
  return fallback.data?.id ?? null;
}
