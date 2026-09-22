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
  type AssistantNotificationPageCursor,
  type AssistantNotificationReadScope,
} from "@/features/agent/server/syncAssistantNotifications";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import {
  projectFleetNotificationRows,
  recordFleetNotificationDismissal,
} from "@/features/fleet/server/fleetNotificationInbox";

const SOURCE_PAGE_SIZE = 250;
const MAX_SOURCE_PAGES = 8;
const INTERNAL_FLEET_ALERT_ROLES = new Set(["owner", "admin", "manager"]);

const BodySchema = z.object({
  action: z.enum(["list", "dismiss"]).default("list"),
  notificationId: z.string().uuid().nullable().optional(),
  fleetId: z.string().uuid().nullable().optional(),
  cursor: z
    .object({
      lastSeenAt: z.string().datetime({ offset: true }),
      id: z.string().uuid(),
    })
    .nullable()
    .optional(),
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

export type FleetNotificationCursor = AssistantNotificationPageCursor;

export type FleetNotificationPage = {
  notifications: FleetNotification[];
  total: number | null;
  nextCursor: FleetNotificationCursor | null;
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
  return { notifications: [], total: 0, nextCursor: null };
}

function metadataFleetId(row: NotificationRow): string | undefined {
  const value = row.metadata?.fleet_id;
  return typeof value === "string" ? value : undefined;
}

async function resolveActorProfileId(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(2);

  if (error) return null;
  return data?.find((row) => row.id === userId)?.id ?? data?.[0]?.id ?? null;
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
    return NextResponse.json(
      parsed.data.action === "dismiss" ? { ok: false } : emptyPage(),
      { status: parsed.data.action === "dismiss" ? 404 : 200 },
    );
  }

  if (parsed.data.action === "dismiss") {
    const notificationId = parsed.data.notificationId;
    if (!notificationId) {
      return NextResponse.json(
        { error: "Notification id is required." },
        { status: 400 },
      );
    }

    const { data: notification, error: notificationError } = await supabaseAdmin
      .from("assistant_notifications")
      .select("id,shop_id,source,status,metadata")
      .eq("id", notificationId)
      .eq("source", "fleet")
      .eq("status", "active")
      .maybeSingle();

    if (notificationError) {
      console.error(
        "[fleet/notifications] dismiss lookup error",
        notificationError,
      );
      return NextResponse.json(
        { error: "Fleet alert could not be dismissed." },
        { status: 500 },
      );
    }
    if (!notification) {
      return NextResponse.json(
        { error: "Fleet alert is no longer active." },
        { status: 409 },
      );
    }

    const rowFleetId =
      notification.metadata &&
      typeof notification.metadata === "object" &&
      !Array.isArray(notification.metadata) &&
      typeof (notification.metadata as Record<string, unknown>).fleet_id ===
        "string"
        ? String((notification.metadata as Record<string, unknown>).fleet_id)
        : null;

    const authorized = scopes.some(
      (scope) =>
        scope.shopId === notification.shop_id &&
        (scope.fleetIds === null ||
          (rowFleetId !== null && scope.fleetIds.includes(rowFleetId))),
    );
    if (!authorized) {
      return NextResponse.json(
        { error: "Fleet alert not found." },
        { status: 404 },
      );
    }

    const profileId = await resolveActorProfileId(supabase, actor.userId);
    if (!profileId) {
      return NextResponse.json(
        { error: "Fleet alert could not be dismissed." },
        { status: 403 },
      );
    }

    try {
      await recordFleetNotificationDismissal({
        supabase: supabaseAdmin,
        notificationId,
        shopId: notification.shop_id,
        fleetId: rowFleetId,
        dismissedBy: profileId,
      });
    } catch (error) {
      console.error("[fleet/notifications] dismiss insert error", error);
      return NextResponse.json(
        { error: "Fleet alert could not be dismissed." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  const sourceRows: NotificationRow[] = [];
  let nextCursor = parsed.data.cursor ?? null;
  let pageCount = 0;
  let available = true;

  try {
    do {
      const page = await readAssistantNotificationPage({
        supabase: supabaseAdmin,
        scopes,
        source: "fleet",
        statuses: ["active"],
        cursor: nextCursor,
        pageSize: SOURCE_PAGE_SIZE,
      });
      available = page.available;
      if (!available) break;

      sourceRows.push(...(page.rows as NotificationRow[]));
      nextCursor = page.nextCursor;
      pageCount += 1;
    } while (nextCursor && pageCount < MAX_SOURCE_PAGES);
  } catch (error) {
    console.error("[fleet/notifications] query error", error);
    return NextResponse.json(
      { error: "Fleet alerts could not be loaded." },
      { status: 500 },
    );
  }

  if (!available) {
    return NextResponse.json(
      { error: "Fleet alerts are not available in this environment." },
      { status: 503 },
    );
  }

  let rows: NotificationRow[];
  try {
    rows = (await projectFleetNotificationRows({
      supabase: supabaseAdmin,
      rows: sourceRows,
    })) as NotificationRow[];
  } catch (error) {
    console.error("[fleet/notifications] projection error", error);
    return NextResponse.json(
      { error: "Fleet alerts could not be loaded." },
      { status: 500 },
    );
  }

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
    total: parsed.data.cursor ? null : rows.length,
    nextCursor,
  } satisfies FleetNotificationPage);
}
