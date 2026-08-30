export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

const BodySchema = z.object({
  fleetId: z.string().uuid().nullable().optional(),
});

export type FleetNotification = {
  id: string;
  level: "info" | "warning" | "critical";
  code: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  fleetId?: string;
  createdAt: string;
  status: "active" | "acknowledged" | "resolved";
};

type NotificationRow = {
  id: string;
  level: FleetNotification["level"];
  code: string;
  title: string;
  message: string;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: FleetNotification["status"];
  metadata: Record<string, unknown> | null;
  last_seen_at: string;
};

function metadataFleetId(row: NotificationRow): string | undefined {
  const value = row.metadata?.fleet_id;
  return typeof value === "string" ? value : undefined;
}

/**
 * Fleet-scoped alert feed.
 *
 * Fleet alerts are written with `source = 'fleet'`, which the shared Shop
 * notification service never selects, so they are unreachable from the Shop
 * bell. They are deliberately NOT added to that feed: it filters on `shop_id`
 * only, so one shop serving several Fleet customers would show one customer's
 * alerts to another. This route authorizes the caller explicitly and pins the
 * read to the fleets that caller is entitled to.
 *
 * Authorization is resolved server-side and the read uses the service-role
 * client, because `assistant_notifications` carries no policy in the migration
 * chain and an external Fleet portal actor is not a shop member.
 */
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = createServerSupabaseRoute();
  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId: parsed.data.fleetId ?? null,
  });

  if (!actor.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fleet alerts are manager/dispatch decisions. Drivers report defects; they
  // do not review the fleet-wide queue.
  if (!actor.capabilities.canSeeFleetWideUnits || !actor.shopId) {
    return NextResponse.json({ notifications: [] });
  }

  let query = supabaseAdmin
    .from("assistant_notifications")
    .select(
      "id, level, code, title, message, href, entity_type, entity_id, status, metadata, last_seen_at",
    )
    .eq("shop_id", actor.shopId)
    .eq("source", "fleet")
    .in("status", ["active", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .limit(50);

  // An external Fleet actor may only ever see their own entitled fleets.
  // Internal shop staff already passed the shop Fleet product entitlement check.
  if (!actor.isInternal) {
    const allowedFleetIds = parsed.data.fleetId
      ? actor.fleetIds.filter((id) => id === parsed.data.fleetId)
      : actor.fleetIds;
    if (allowedFleetIds.length === 0) {
      return NextResponse.json({ notifications: [] });
    }
    query = query.in("metadata->>fleet_id", allowedFleetIds);
  } else if (parsed.data.fleetId) {
    query = query.eq("metadata->>fleet_id", parsed.data.fleetId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[fleet/notifications] query error", error);
    return NextResponse.json(
      { error: "Fleet alerts could not be loaded." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as NotificationRow[];

  return NextResponse.json({
    notifications: rows.map((row) => ({
      id: row.id,
      level: row.level,
      code: row.code,
      title: row.title,
      message: row.message,
      href: row.href ?? undefined,
      entityType: row.entity_type ?? undefined,
      entityId: row.entity_id ?? undefined,
      fleetId: metadataFleetId(row),
      createdAt: row.last_seen_at,
      status: row.status,
    })) satisfies FleetNotification[],
  });
}
