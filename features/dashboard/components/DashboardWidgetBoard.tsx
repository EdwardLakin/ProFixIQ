"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { buildDefaultDashboardLayout } from "@/features/dashboard/lib/defaultLayout";
import { normalizeDashboardLayout } from "@/features/dashboard/lib/dashboard-layouts";
import {
  DASHBOARD_WIDGET_RESPONSIVE_META,
  getDashboardViewport,
  getDashboardZoneColumns,
  getWidgetSpanForViewport,
  type DashboardViewport,
} from "@/features/dashboard/lib/dashboard-responsive-layout";
import {
  getWidgetsForView,
  type DashboardView,
} from "@/features/dashboard/lib/dashboard-views";
import { getDashboardWidgetRegistry } from "@/features/dashboard/lib/widget-registry";
import type {
  DashboardRenderContext,
  DashboardWidgetId,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

type Props = {
  view: DashboardView;
  role: string | null;
  context: DashboardRenderContext;
  initialLayout?: DashboardWidgetLayout[];
  onLayoutChange?: (nextLayout: DashboardWidgetLayout[]) => void;
};

const MIN_WIDGET_HEIGHT = 3;
const MAX_WIDGET_HEIGHT = 7;

function orderLayout(layout: DashboardWidgetLayout[]): DashboardWidgetLayout[] {
  return [...layout].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });
}

export default function DashboardWidgetBoard({
  view,
  role,
  context,
  initialLayout,
  onLayoutChange,
}: Props) {
  const registry = useMemo(() => getDashboardWidgetRegistry(role), [role]);

  const computedInitialLayout = useMemo(
    () =>
      normalizeDashboardLayout(
        initialLayout ?? buildDefaultDashboardLayout(registry),
        registry,
      ),
    [initialLayout, registry],
  );

  const [layout, setLayout] = useState<DashboardWidgetLayout[]>(computedInitialLayout);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [viewport, setViewport] = useState<DashboardViewport>("desktop");
  const [screenWidth, setScreenWidth] = useState(1536);
  const prevSerializedRef = useRef<string>(JSON.stringify(computedInitialLayout));

  useEffect(() => {
    const syncViewport = () => {
      const width = window.innerWidth;
      setScreenWidth(width);
      setViewport(getDashboardViewport(width));
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(computedInitialLayout);
    if (serialized !== prevSerializedRef.current) {
      prevSerializedRef.current = serialized;
      setLayout(computedInitialLayout);
    }
  }, [computedInitialLayout]);

  useEffect(() => {
    if (!onLayoutChange) return;

    const serialized = JSON.stringify(layout);
    if (serialized === prevSerializedRef.current) return;

    prevSerializedRef.current = serialized;
    onLayoutChange(orderLayout(layout));
  }, [layout, onLayoutChange]);

  const widgetById = useMemo(
    () => new Map(registry.map((widget) => [widget.id, widget] as const)),
    [registry],
  );

  const allWidgets = useMemo(
    () =>
      orderLayout(layout)
        .map((item) => ({ item, widget: widgetById.get(item.id) }))
        .filter(
          (
            entry,
          ): entry is { item: DashboardWidgetLayout; widget: DashboardWidgetModule } =>
            Boolean(entry.widget),
        ),
    [layout, widgetById],
  );

  const viewIds = useMemo(() => new Set(getWidgetsForView(view)), [view]);

  const viewWidgets = useMemo(
    () => allWidgets.filter(({ item }) => viewIds.has(item.id)),
    [allWidgets, viewIds],
  );

  const visibleWidgets = useMemo(
    () => viewWidgets.filter(({ item }) => item.hidden !== true),
    [viewWidgets],
  );

  const visibleById = useMemo(
    () => new Map(visibleWidgets.map((entry) => [entry.item.id, entry] as const)),
    [visibleWidgets],
  );

  const handleWidgetVisibilityToggle = (widgetId: DashboardWidgetLayout["id"]) => {
    setLayout((currentLayout) =>
      currentLayout.map((item) =>
        item.id === widgetId ? { ...item, hidden: item.hidden !== true } : item,
      ),
    );
  };

  const handleWidgetHeightAdjust = (widgetId: DashboardWidgetId, delta: number) => {
    const widget = widgetById.get(widgetId);
    if (!widget) return;

    setLayout((currentLayout) =>
      currentLayout.map((item) => {
        if (item.id !== widgetId) return item;

        const maxH = widget.maxH ?? MAX_WIDGET_HEIGHT;
        const minH = Math.max(widget.minH, MIN_WIDGET_HEIGHT);
        const nextHeight = Math.max(minH, Math.min(maxH, item.h + delta));

        if (nextHeight === item.h) return item;
        return { ...item, h: nextHeight };
      }),
    );
  };

  const zoneColumns = getDashboardZoneColumns(screenWidth);
  const isCompactDensity = viewport !== "desktop";

  const renderWidget = (
    item: DashboardWidgetLayout,
    widget: DashboardWidgetModule,
    options?: {
      emphasis?: "dominant" | "normal";
      compact?: boolean;
      className?: string;
    },
  ) => {
    const emphasis = options?.emphasis ?? "normal";
    const compact = options?.compact ?? false;
    const className = options?.className ?? "";
    const meta = DASHBOARD_WIDGET_RESPONSIVE_META[item.id];

    const emphasisClass =
      emphasis === "dominant" ? "ring-1 ring-[var(--brand-accent,#E39A6E)]/35" : "";
    const compactDensityClass = compact
      ? "[&_p]:hidden [&_.pfq-widget-shell]:pr-0 [&_.pfq-widget-shell]:text-[12px] [&_.pfq-widget-shell]:leading-snug"
      : "";
    const renderItem = compact ? { ...item, h: Math.min(item.h, 3) } : item;
    const minHeight = compact ? meta.compactMinHeightRem : meta.preferredMinHeightRem;

    return (
      <div
        key={item.id}
        className={`min-h-0 ${className}`}
        style={{
          gridColumn: `span ${getWidgetSpanForViewport(item.id, viewport, zoneColumns)} / span ${getWidgetSpanForViewport(item.id, viewport, zoneColumns)}`,
          minHeight: `${minHeight}rem`,
        }}
      >
        <div className={`h-full min-h-0 ${emphasisClass} ${compactDensityClass}`}>
          {widget.selfContained ? (
            <div className="h-full min-h-0">{widget.render(context, renderItem)}</div>
          ) : (
            <DashboardWidgetShell
              title={widget.title}
              description={compact ? undefined : widget.description}
              compact={compact}
              className="min-h-0"
              scrollClassName="pb-2"
            >
              {widget.render(context, renderItem)}
            </DashboardWidgetShell>
          )}
        </div>
      </div>
    );
  };

  const operationTopIds: DashboardWidgetId[] = ["daily_summary", "shop_pulse", "suggested_actions"];
  const operationPrimaryIds: DashboardWidgetId[] = ["work_order_board"];
  const operationSecondaryIds: DashboardWidgetId[] = ["approval_risk", "waiting_parts"];
  const operationBusinessIds: DashboardWidgetId[] = ["advisor_queue", "tech_load", "live_shop_load"];

  const performanceTopIds: DashboardWidgetId[] = ["stats_overview", "revenue_watch", "reports_performance"];
  const performancePrimaryIds: DashboardWidgetId[] = ["tech_performance", "optimization_opportunities"];
  const performanceSecondaryIds: DashboardWidgetId[] = ["comeback_risk"];
  const performanceBusinessIds: DashboardWidgetId[] = ["bookings"];

  const renderZone = (ids: DashboardWidgetId[], options?: { compact?: boolean; emphasis?: "dominant" | "normal" }) => (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${zoneColumns}, minmax(0, 1fr))`,
      }}
    >
      {ids
        .map((id) => visibleById.get(id))
        .filter((entry): entry is { item: DashboardWidgetLayout; widget: DashboardWidgetModule } => Boolean(entry))
        .map(({ item, widget }) =>
          renderWidget(item, widget, {
            compact: options?.compact ?? isCompactDensity,
            emphasis: options?.emphasis,
          }),
        )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setControlsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-black/40"
        >
          <Settings2 className="h-3.5 w-3.5" />
          View controls
        </button>
      </div>

      {controlsOpen ? (
        <div className="fixed inset-0 z-[75] bg-black/60 p-3 sm:p-4" onClick={() => setControlsOpen(false)}>
          <aside
            className="ml-auto h-full w-full max-w-xl overflow-y-auto rounded-2xl border p-4"
            onClick={(event) => event.stopPropagation()}
            style={{
              borderColor: "var(--theme-card-border,#334155)",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg,#111827) 95%, black), color-mix(in srgb, var(--brand-secondary,#0F172A) 62%, black))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-accent,#E39A6E)" }}>
                  {view === "operations" ? "Operations Controls" : "Performance Controls"}
                </div>
                <div className="mt-1 text-xs text-neutral-300">
                  Lightweight personalization only: toggle widget visibility and compact height.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setControlsOpen(false)}
                className="rounded-full border border-white/10 bg-black/30 p-1.5 text-neutral-200"
                aria-label="Close view controls"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {viewWidgets.map(({ item, widget }) => {
                const enabled = item.hidden !== true;
                const minH = Math.max(widget.minH, MIN_WIDGET_HEIGHT);
                const maxH = widget.maxH ?? MAX_WIDGET_HEIGHT;
                const canShrink = item.h > minH;
                const canGrow = item.h < maxH;

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                    style={{
                      borderColor: "color-mix(in srgb, var(--theme-card-border,#334155) 82%, transparent)",
                      background: "color-mix(in srgb, var(--theme-card-bg,#111827) 90%, black)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleWidgetVisibilityToggle(item.id)}
                      className="rounded-full border px-2.5 py-1 text-[11px] transition"
                      style={{
                        borderColor: enabled
                          ? "color-mix(in srgb, var(--brand-accent,#E39A6E) 60%, transparent)"
                          : "var(--theme-card-border,#334155)",
                        background: enabled
                          ? "color-mix(in srgb, var(--brand-accent,#E39A6E) 22%, transparent)"
                          : "color-mix(in srgb, var(--theme-card-bg,#111827) 84%, black)",
                        color: enabled
                          ? "var(--theme-text-primary,#F8FAFC)"
                          : "var(--theme-text-secondary,#94A3B8)",
                      }}
                      aria-pressed={enabled}
                      aria-label={`${enabled ? "Hide" : "Show"} ${widget.title} widget`}
                    >
                      {enabled ? "On" : "Off"} · {widget.title}
                    </button>

                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                      <span>Height</span>
                      <button
                        type="button"
                        onClick={() => handleWidgetHeightAdjust(item.id, -1)}
                        disabled={!canShrink}
                        className="rounded border border-white/10 px-2 py-0.5 text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Decrease ${widget.title} height`}
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-neutral-200">{item.h}</span>
                      <button
                        type="button"
                        onClick={() => handleWidgetHeightAdjust(item.id, 1)}
                        disabled={!canGrow}
                        className="rounded border border-white/10 px-2 py-0.5 text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Increase ${widget.title} height`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}

      {view === "operations" ? (
        <section className="space-y-3">
          {renderZone(operationTopIds, { compact: true })}
          {renderZone(operationPrimaryIds, { emphasis: "dominant" })}
          {renderZone(operationSecondaryIds, { compact: true })}
          {renderZone(operationBusinessIds)}
        </section>
      ) : (
        <section className="space-y-3">
          {renderZone(performanceTopIds, { compact: true })}
          {renderZone(performancePrimaryIds)}
          {renderZone(performanceSecondaryIds)}
          {renderZone(performanceBusinessIds)}
        </section>
      )}
    </div>
  );
}
