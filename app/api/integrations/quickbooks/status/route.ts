export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requireQuickBooksShopAccess } from "@/features/integrations/quickbooks/server/auth";

export async function GET() {
  try {
    const supabase = createServerSupabaseRoute();

    const auth = await requireQuickBooksShopAccess(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { shop } = auth.data;

    const { data, error } = await supabase
      .from("quickbooks_connections")
      .select(
        "id, realm_id, environment, connected_at, is_active, last_sync_at, last_error",
      )
      .eq("shop_id", shop.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      connected: Boolean(data),
      connection: data
        ? {
            id: data.id,
            realmId: data.realm_id,
            environment: data.environment,
            connectedAt: data.connected_at,
            isActive: data.is_active,
            lastSyncAt: data.last_sync_at,
            lastError: data.last_error,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load QuickBooks status.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}