// app/api/work-orders/quotes/[id]/mark-quoted/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";


export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  try {
    // Extract `[id]` from the pathname .../quotes/<id>/mark-quoted
    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2]; // segment before "mark-quoted"

    if (!id) {
      return NextResponse.json({ error: "Missing quote line id" }, { status: 400 });
    }

    // Mark the quote line as quoted
    const { error: updErr } = await supabase
      .from("work_order_quote_lines")
      .update({ status: "quoted", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to mark as quoted" }, { status: 500 });
  }
}