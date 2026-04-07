import { NextResponse } from "next/server";
import { requireBrandShopReadAccess } from "@/features/branding/server/brand";

export async function POST() {
  const auth = await requireBrandShopReadAccess(null);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await auth.supabase
    .from("user_theme_preferences")
    .delete()
    .eq("user_id", auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}