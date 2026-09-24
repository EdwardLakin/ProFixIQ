export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { connectGeotab } from "@/features/integrations/fleetTrackers/geotab/connect";
import { syncGeotabConnection } from "@/features/integrations/fleetTrackers/geotab/sync";

type Body = {
  database?: string;
  username?: string;
  password?: string;
  server?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Body;

  if (!body.database || !body.username || !body.password) {
    return NextResponse.json(
      { ok: false, error: "Database, username, and password are all required." },
      { status: 400 },
    );
  }

  const connectResult = await connectGeotab(auth.supabase, {
    shopId: auth.profile.shop_id,
    actorId: auth.profile.id,
    database: body.database,
    username: body.username,
    password: body.password,
    server: body.server,
  });

  if (!connectResult.ok) {
    return NextResponse.json({ ok: false, error: connectResult.error }, { status: 502 });
  }

  const { data: connectionRow, error: fetchError } = await auth.supabase
    .from("fleet_tracker_connections")
    .select("id, shop_id, credentials")
    .eq("id", connectResult.connectionId)
    .single();

  if (fetchError || !connectionRow) {
    return NextResponse.json(
      { ok: true, connectionId: connectResult.connectionId, synced: false },
      { status: 200 },
    );
  }

  const syncResult = await syncGeotabConnection(auth.supabase, connectionRow);

  return NextResponse.json({
    ok: true,
    connectionId: connectResult.connectionId,
    synced: syncResult.ok,
    sync: syncResult,
  });
}
