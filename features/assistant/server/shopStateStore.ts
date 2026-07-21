import { createClient } from "@supabase/supabase-js";
import { getSuggestedActions } from "@/features/assistant/server/getSuggestedActions";
import {
  canonicalizeRole,
  getActorCapabilities,
} from "@/features/shared/lib/rbac";
import type { Json } from "@shared/types/types/supabase";
import type { SuggestedActionContext } from "../types/suggested-actions";
import type {
  ShopAssistantAlert,
  ShopAssistantBaseState,
  ShopAssistantMetric,
  ShopAssistantState,
  ShopAssistantSuggestion,
} from "../types/shopState";
import { buildShopAssistantBaseState } from "./buildShopState";
import { asShopAssistantClient } from "./shopAssistantDatabase";

function createAssistantAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Shop Assistant state requires Supabase service credentials");
  }

  return asShopAssistantClient(
    createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
}

function isBaseState(value: unknown): value is ShopAssistantBaseState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.shopId === "string" &&
    typeof record.timezone === "string" &&
    typeof record.generatedAt === "string" &&
    typeof record.staleAfter === "string" &&
    Array.isArray(record.metrics) &&
    Array.isArray(record.alerts)
  );
}

function metricVisible(
  metric: ShopAssistantMetric,
  actor: ReturnType<typeof getActorCapabilities>,
): boolean {
  switch (metric.key) {
    case "active_work_orders":
    case "stalled_work_orders":
      return actor.canViewShopWideData || actor.canManageWorkOrders;
    case "overdue_approvals":
      return actor.canAuthorizeQuotes || actor.canViewShopWideData;
    case "delayed_parts":
      return actor.canManageParts || actor.canViewShopWideData;
    case "idle_technicians":
      return actor.canManageWorkforce || actor.canAssignWork;
    case "ready_to_invoice":
      return actor.canViewFinancials || actor.canAuthorizeQuotes;
    case "appointments_today":
      return actor.canManageScheduling || actor.canViewShopWideData;
    default:
      return false;
  }
}

function alertVisible(
  alert: ShopAssistantAlert,
  actor: ReturnType<typeof getActorCapabilities>,
): boolean {
  if (alert.code.includes("invoice")) {
    return actor.canViewFinancials || actor.canAuthorizeQuotes;
  }
  if (
    alert.code.includes("parts") ||
    alert.code.includes("inventory") ||
    alert.entityType === "part"
  ) {
    return actor.canManageParts || actor.canViewShopWideData;
  }
  if (
    alert.code.includes("tech_") ||
    alert.code.includes("shop_") ||
    alert.entityType === "profile"
  ) {
    return actor.canManageWorkforce || actor.canAssignWork;
  }
  if (alert.code.includes("approval") || alert.code.includes("quote")) {
    return actor.canAuthorizeQuotes || actor.canViewShopWideData;
  }
  if (alert.entityType === "booking") {
    return actor.canManageScheduling || actor.canViewShopWideData;
  }
  return actor.canManageWorkOrders || actor.canViewShopWideData;
}

function suggestionLevel(
  value: "info" | "warning" | "critical",
): ShopAssistantSuggestion["level"] {
  return value;
}

function technicianBoundaryState(params: {
  shopId: string;
  role: string;
}): ShopAssistantState {
  const generatedAt = new Date();
  return {
    shopId: params.shopId,
    timezone: "UTC",
    localDayKey: generatedAt.toISOString().slice(0, 10),
    generatedAt: generatedAt.toISOString(),
    staleAfter: new Date(generatedAt.getTime() + 60_000).toISOString(),
    role: params.role,
    scope: "technician",
    metrics: [],
    alerts: [],
    suggestions: [
      {
        id: "technician-assistant-boundary",
        level: "info",
        title: "Use the assistant inside the work order",
        description:
          "Technician diagnostics and job guidance remain inside each assigned work order.",
        href: "/work-orders",
      },
    ],
  };
}

export function filterShopAssistantBaseStateForActor(params: {
  base: ShopAssistantBaseState;
  role: string | null;
  suggestions?: ShopAssistantSuggestion[];
}): ShopAssistantState {
  const actor = getActorCapabilities({ role: params.role });
  const role = actor.canonicalRole;

  if (role === "mechanic") {
    return technicianBoundaryState({
      shopId: params.base.shopId,
      role,
    });
  }

  return {
    ...params.base,
    role,
    scope: actor.canViewShopWideData ? "shop" : "limited",
    metrics: params.base.metrics.filter((metric) => metricVisible(metric, actor)),
    alerts: params.base.alerts.filter((alert) => alertVisible(alert, actor)),
    suggestions: params.suggestions ?? [],
  };
}

async function loadCachedBaseState(
  shopId: string,
): Promise<ShopAssistantBaseState | null> {
  const client = createAssistantAdminClient();
  const { data, error } = await client
    .from("assistant_shop_states")
    .select("snapshot")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return isBaseState(data?.snapshot) ? data.snapshot : null;
}

async function saveBaseState(state: ShopAssistantBaseState): Promise<void> {
  const client = createAssistantAdminClient();
  const timestamp = new Date().toISOString();
  const { error } = await client.from("assistant_shop_states").upsert(
    {
      shop_id: state.shopId,
      snapshot: state as unknown as Json,
      version: 1,
      refreshed_at: state.generatedAt,
      updated_at: timestamp,
    },
    { onConflict: "shop_id" },
  );

  if (error) throw new Error(error.message);
}

export async function getOrRefreshShopAssistantBaseState(params: {
  shopId: string;
  force?: boolean;
}): Promise<ShopAssistantBaseState> {
  if (!params.force) {
    const cached = await loadCachedBaseState(params.shopId);
    if (cached && new Date(cached.staleAfter).getTime() > Date.now()) {
      return cached;
    }
  }

  const base = await buildShopAssistantBaseState(params.shopId);
  await saveBaseState(base);
  return base;
}

export async function getShopAssistantStateForActor(params: {
  shopId: string;
  userId: string;
  role: string | null;
  force?: boolean;
  context?: SuggestedActionContext;
}): Promise<ShopAssistantState> {
  const canonicalRole = canonicalizeRole(params.role);
  if (canonicalRole === "mechanic") {
    return technicianBoundaryState({
      shopId: params.shopId,
      role: canonicalRole,
    });
  }

  const base = await getOrRefreshShopAssistantBaseState({
    shopId: params.shopId,
    force: params.force,
  });
  const suggested = await getSuggestedActions({
    shopId: params.shopId,
    userId: params.userId,
    role: params.role,
    context: params.context,
  });

  const suggestions: ShopAssistantSuggestion[] = suggested.items.map((item) => ({
    id: item.id,
    level: suggestionLevel(item.level),
    title: item.title,
    description: item.description,
    href: item.href,
    plannerHref: item.plannerHref,
    entityType: item.entityType,
    entityId: item.entityId,
  }));

  return filterShopAssistantBaseStateForActor({
    base,
    role: params.role,
    suggestions,
  });
}
