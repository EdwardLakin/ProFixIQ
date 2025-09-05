import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const id = params.id;
    const { laborPrice, partsPrice, parts } = await _req.json();

    const { error } = await supabase
      .from("work_order_quote_lines")
      .update({
        labor_price: laborPrice ?? null,
        parts_price: partsPrice ?? null,
        parts: parts ?? null,
        status: "awaiting_auth",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update quote line" }, { status: 500 });
  }
}