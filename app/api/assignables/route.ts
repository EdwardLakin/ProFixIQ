// app/api/assignables/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side ONLY
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["mechanic", "tech", "foreman", "lead_hand"])
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}