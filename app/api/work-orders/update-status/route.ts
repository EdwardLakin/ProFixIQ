// app/api/work-orders/update-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Command = "punch-in" | "complete";

type QuoteLineItem = {
  name: string;
  description?: string;
  labor_time?: number;
  part_name?: string;
  part_price?: number;
  parts_cost?: number;
  total_price?: number;
};

type WorkOrderUpdate = Database["public"]["Tables"]["work_orders"]["Update"];
type QuoteField = WorkOrderUpdate["quote"];

interface RequestBody {
  workOrderId: string;
  command: Command;
  quote?: QuoteLineItem[];
  summary?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const { workOrderId, command, quote, summary } = body;

    if (!workOrderId || !command) {
      return NextResponse.json(
        { error: "Missing workOrderId or command" },
        { status: 400 },
      );
    }

    let updateFields: WorkOrderUpdate = {};

    if (command === "punch-in") {
      updateFields = {
        status: "in_progress",
      };
    } else if (command === "complete") {
      const nextFields: WorkOrderUpdate = {
        status: "completed",
      };

      if (quote && summary) {
        const quotePayload = {
          summary,
          items: quote,
        };

        // Cast through QuoteField without using `any`
        (nextFields as WorkOrderUpdate).quote =
          quotePayload as unknown as QuoteField;
      }

      updateFields = nextFields;
    } else {
      return NextResponse.json(
        { error: "Unknown command" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("work_orders")
      .update(updateFields)
      .eq("id", workOrderId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, updated: updateFields });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Work order update failed:", message);
    return NextResponse.json(
      { error: "Update failed" },
      { status: 500 },
    );
  }
}