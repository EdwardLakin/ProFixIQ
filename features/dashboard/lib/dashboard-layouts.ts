import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@shared/types/types/supabase";
import {
  buildDefaultDashboardLayout,
  getDashboardDefaultLayoutMap,
} from "@/features/dashboard/lib/defaultLayout";
import type {
  DashboardWidgetDefinition,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";

type DB = Database;

type DashboardLayoutRow = DB["public"]["Tables"]["dashboard_layouts"]["Row"];

type LoadDashboardLayoutArgs = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  userId: string | null;
  widgets: DashboardWidgetDefinition[];
};

type SaveDashboardLayoutArgs = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  userId: string | null;
  layout: DashboardWidgetLayout[];
};

function isDashboardWidgetLayout(value: unknown): value is DashboardWidgetLayout {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.w === "number" &&
    typeof candidate.h === "number" &&
    (typeof candidate.hidden === "undefined" || typeof candidate.hidden === "boolean")
  );
}

function parseLayoutJson(layout: Json | null): DashboardWidgetLayout[] {
  if (!Array.isArray(layout)) return [];

  return layout.filter(isDashboardWidgetLayout);
}

export function normalizeDashboardLayout(
  layout: DashboardWidgetLayout[],
  widgets: DashboardWidgetDefinition[],
): DashboardWidgetLayout[] {
  const defaults = getDashboardDefaultLayoutMap(widgets);

  const widgetsById = new Map(widgets.map((widget) => [widget.id, widget] as const));

  const merged = layout
    .map((item) => {
      const fallback = defaults.get(item.id);
      const widget = widgetsById.get(item.id);
      if (!fallback || !widget) return null;

      const maxHeight = widget.maxH ?? 7;
      const minHeight = Math.max(widget.minH, 3);
      const parsedHeight = Number.isFinite(item.h) ? item.h : fallback.h;

      const normalized: DashboardWidgetLayout = {
        id: item.id,
        x: fallback.x,
        y: fallback.y,
        w: fallback.w,
        h: Math.min(maxHeight, Math.max(minHeight, parsedHeight)),
      };
      if (item.hidden === true) {
        normalized.hidden = true;
      }

      return normalized;
    })
    .filter((item): item is DashboardWidgetLayout => Boolean(item));

  const seen = new Set(merged.map((item) => item.id));
  const missing = buildDefaultDashboardLayout(widgets).filter((item) => !seen.has(item.id));

  return [...merged, ...missing].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });
}

async function loadLayoutRow(
  supabase: SupabaseClient<DB>,
  shopId: string,
  userId: string | null,
): Promise<DashboardLayoutRow | null> {
  if (userId) {
    const { data, error } = await supabase
      .from("dashboard_layouts")
      .select("id, shop_id, user_id, layout, created_at, updated_at")
      .eq("shop_id", shopId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) return data;
  }

  const { data } = await supabase
    .from("dashboard_layouts")
    .select("id, shop_id, user_id, layout, created_at, updated_at")
    .eq("shop_id", shopId)
    .is("user_id", null)
    .maybeSingle();

  return data ?? null;
}

export async function loadDashboardLayout({
  supabase,
  shopId,
  userId,
  widgets,
}: LoadDashboardLayoutArgs): Promise<DashboardWidgetLayout[]> {
  const fallback = buildDefaultDashboardLayout(widgets);

  const row = await loadLayoutRow(supabase, shopId, userId);
  if (!row) return fallback;

  return normalizeDashboardLayout(parseLayoutJson(row.layout), widgets);
}

export async function saveDashboardLayout({
  supabase,
  shopId,
  userId,
  layout,
}: SaveDashboardLayoutArgs): Promise<void> {
  const { error } = await supabase.from("dashboard_layouts").upsert(
    {
      shop_id: shopId,
      user_id: userId,
      layout,
    },
    {
      onConflict: "shop_id,user_id",
    },
  );

  if (error) {
    console.error("[dashboard-layout] save failed", error);
  }
}
