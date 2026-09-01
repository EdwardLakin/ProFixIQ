export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageFleetForActor,
  manageableFleetIdsForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

const PAGE_SIZE = 50;

const BodySchema = z.object({
  fleetId: z.string().uuid().nullable().optional(),
  offset: z.number().int().min(0).max(100000).optional(),
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

export type FleetNotificationPage = {
  notifications: FleetNotification[];
  total: number;
  nextOffset: number | null;
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

function emptyPage(): FleetNotificationPage {
  return { notifications: [], total: 0, nextOffset: null };
}

function metadataFleetId(row: NotificationRow): string | undefined {
  const value = row.metadata?.fleet_id;
  return typeof value === "string" ? value : undefined;
}

/**
 * Fleet-scoped alert feed.
 *
 * Fleet alerts are deliberately kept out of the Shop notification feed because
 * Shop visibility is shop-wide while external Fleet visibility is membership-
 * scoped. This endpoint resolves the caller server-side, derives manageable
 * fleets membership by membership, and only then reads the canonical alert
 * relation through the service client.
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

  if (!actor.shopId) {
    return NextResponse.json(emptyPage());
  }

  const manageableFleetIds = actor.isInternal
    ? []
    : manageableFleetIdsForActor(actor);
  const eligible = actor.isInternal
    ? actor.capabilities.canSeeFleetWideUnits
    : manageableFleetIds.length > 0;
  if (!eligible) {
    return NextResponse.json(emptyPage());
  }

  const offset = parsed.data.offset ?? 0;
  let query = supabaseAdmin
    .from("assistant_notifications")
    .select(
      "id, level, code, title, message, href, entity_type, entity_id, status, metadata, last_seen_at",
      { count: "exact" },
    )
    .eq("shop_id", actor.shopId)
    .eq("source", "fleet")
    .in("status", ["active", "acknowledged"])
    .order("last_seen_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (!actor.isInternal) {
    const requestedFleetId = parsed.data.fleetId;
    const allowedFleetIds = requestedFleetId
      ? canManageFleetForActor(actor, requestedFleetId)
        ? [requestedFleetId]
        : []
      : manageableFleetIds;
    if (allowedFleetIds.length === 0) {
      return NextResponse.json(emptyPage());
    }
    query = query.in("metadata->>fleet_id", allowedFleetIds);
  } else if (parsed.data.fleetId) {
    query = query.eq("metadata->>fleet_id", parsed.data.fleetId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[fleet/notifications] query error", error);
    return NextResponse.json(
      { error: "Fleet alerts could not be loaded." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as NotificationRow[];
  const total = count ?? offset + rows.length;
  const consumed = offset + rows.length;

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
    total,
    nextOffset: consumed < total ? consumed : null,
  } satisfies FleetNotificationPage);
}
