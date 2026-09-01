export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageFleetForActor,
  manageableFleetIdsForActor,
  resolveFleetActorContext,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import {
  readAssistantNotificationPage,
  type AssistantNotificationReadScope,
} from "@/features/agent/server/syncAssistantNotifications";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

const PAGE_SIZE = 50;
const INTERNAL_FLEET_ALERT_ROLES = new Set(["owner", "admin", "manager"]);

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

function fleetNotificationReadScopes(
  actor: FleetActorContext,
  requestedFleetId?: string | null,
): AssistantNotificationReadScope[] {
  if (actor.isInternal) {
    if (!INTERNAL_FLEET_ALERT_ROLES.has(actor.canonicalRole)) {
      return [];
    }
    return actor.shopId
      ? [
          {
            shopId: actor.shopId,
            fleetIds: requestedFleetId ? [requestedFleetId] : null,
          },
        ]
      : [];
  }

  const manageableFleetIds = new Set(manageableFleetIdsForActor(actor));
  if (
    requestedFleetId &&
    (!manageableFleetIds.has(requestedFleetId) ||
      !canManageFleetForActor(actor, requestedFleetId))
  ) {
    return [];
  }

  const byShop = new Map<string, Set<string>>();
  for (const membership of actor.fleetMemberships) {
    if (
      !membership.shopId ||
      !manageableFleetIds.has(membership.fleetId) ||
      (requestedFleetId && membership.fleetId !== requestedFleetId)
    ) {
      continue;
    }
    const fleetIds = byShop.get(membership.shopId) ?? new Set<string>();
    fleetIds.add(membership.fleetId);
    byShop.set(membership.shopId, fleetIds);
  }

  return Array.from(byShop, ([shopId, fleetIds]) => ({
    shopId,
    fleetIds: Array.from(fleetIds),
  }));
}

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

  const scopes = fleetNotificationReadScopes(
    actor,
    parsed.data.fleetId ?? null,
  );
  if (
    scopes.length === 0 ||
    (actor.isInternal && !actor.capabilities.canSeeFleetWideUnits)
  ) {
    return NextResponse.json(emptyPage());
  }

  const offset = parsed.data.offset ?? 0;
  let page;
  try {
    page = await readAssistantNotificationPage({
      supabase: supabaseAdmin,
      scopes,
      source: "fleet",
      statuses: ["active", "acknowledged"],
      offset,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    console.error("[fleet/notifications] query error", error);
    return NextResponse.json(
      { error: "Fleet alerts could not be loaded." },
      { status: 500 },
    );
  }

  if (!page.available) {
    return NextResponse.json(
      { error: "Fleet alerts are not available in this environment." },
      { status: 503 },
    );
  }

  const rows = page.rows as NotificationRow[];

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
    total: page.total,
    nextOffset: page.nextOffset,
  } satisfies FleetNotificationPage);
}
