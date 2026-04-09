"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import GridLayout, {
  type Layout,
  type LayoutItem,
  useContainerWidth,
} from "react-grid-layout";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import {
  DASHBOARD_GRID_COLUMNS,
  buildDefaultDashboardLayout,
} from "@/features/dashboard/lib/defaultLayout";
import { normalizeDashboardLayout } from "@/features/dashboard/lib/dashboard-layouts";
import { getDashboardWidgetRegistry } from "@/features/dashboard/lib/widget-registry";
import type {
  DashboardRenderContext,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

type Props = {
  role: string | null;
  context: DashboardRenderContext;
  initialLayout?: DashboardWidgetLayout[];
  onLayoutChange?: (nextLayout: DashboardWidgetLayout[]) => void;
};

function compareLayoutPosition(a: DashboardWidgetLayout, b: DashboardWidgetLayout): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return a.id.localeCompare(b.id);
}

function normalizeGridLayoutItem(
  item: LayoutItem,
  fallback: DashboardWidgetLayout,
): DashboardWidgetLayout {
  return {
    id: fallback.id,
    x: Number.isFinite(item.x) ? item.x : fallback.x,
    y: Number.isFinite(item.y) ? item.y : fallback.y,
    w: Number.isFinite(item.w) ? item.w : fallback.w,
    h: Number.isFinite(item.h) ? item.h : fallback.h,
    hidden: fallback.hidden === true,
  };
}

export default function DashboardWidgetBoard({
  role,
  context,
  initialLayout,
  onLayoutChange,
}: Props) {
  const registry = useMemo(() => getDashboardWidgetRegistry(role), [role]);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const computedInitialLayout = useMemo(
    () =>
      normalizeDashboardLayout(
        initialLayout ?? buildDefaultDashboardLayout(registry),
        registry,
      ),
    [initialLayout, registry],
  );

  const [layout, setLayout] = useState<DashboardWidgetLayout[]>(computedInitialLayout);
  const prevSerializedRef = useRef<string>(JSON.stringify(computedInitialLayout));
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsSmallScreen(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
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
    onLayoutChange(layout);
  }, [layout, onLayoutChange]);

  const widgetById = useMemo(
    () => new Map(registry.map((widget) => [widget.id, widget] as const)),
    [registry],
  );

  const orderedWidgets = useMemo(
    () =>
      layout
        .map((item) => ({ item, widget: widgetById.get(item.id) }))
        .filter(
          (
            entry,
          ): entry is { item: DashboardWidgetLayout; widget: DashboardWidgetModule } =>
            Boolean(entry.widget),
        )
        .sort((a, b) => compareLayoutPosition(a.item, b.item)),
    [layout, widgetById],
  );
  const visibleWidgets = useMemo(
    () => orderedWidgets.filter(({ item }) => item.hidden !== true),
    [orderedWidgets],
  );

  const gridLayout = useMemo(
    () =>
      visibleWidgets.map(({ item, widget }) => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: widget.minW,
        minH: widget.minH,
        maxW: widget.maxW,
        maxH: widget.maxH,
      } satisfies LayoutItem)),
    [visibleWidgets],
  );

  const handleGridLayoutChange = (nextGridLayout: Layout) => {
    const fallbackById = new Map(layout.map((item) => [item.id, item] as const));
    const visibleById = new Map(
      nextGridLayout.map((item) => [item.i as DashboardWidgetLayout["id"], item] as const),
    );

    const nextLayout = layout
      .map((current) => {
        const fallback = fallbackById.get(current.id);
        if (!fallback) return current;

        const visibleItem = visibleById.get(current.id);
        if (!visibleItem) return fallback;

        return normalizeGridLayoutItem(visibleItem, fallback);
      })
      .sort(compareLayoutPosition);

    if (!nextLayout.length) return;

    const currentSerialized = JSON.stringify(layout);
    const nextSerialized = JSON.stringify(nextLayout);
    if (currentSerialized === nextSerialized) return;

    setLayout(nextLayout);
  };

  const handleWidgetVisibilityToggle = (widgetId: DashboardWidgetLayout["id"]) => {
    setLayout((currentLayout) =>
      currentLayout.map((item) =>
        item.id === widgetId ? { ...item, hidden: item.hidden !== true } : item,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-3xl border px-4 py-3"
        style={{
          borderColor: "var(--theme-card-border,#334155)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg,#111827) 92%, black), color-mix(in srgb, var(--brand-secondary,#0F172A) 58%, black))",
        }}
      >
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: "var(--brand-accent,#E39A6E)" }}
        >
          Widget Layout
        </div>
        <div
          className="mt-1 text-sm"
          style={{ color: "var(--theme-text-secondary,#94A3B8)" }}
        >
          Drag and resize widgets on desktop. Small screens keep simple stacked cards.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {orderedWidgets.map(({ item, widget }) => {
            const enabled = item.hidden !== true;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleWidgetVisibilityToggle(item.id)}
                className="rounded-full border px-3 py-1.5 text-xs transition"
                style={{
                  borderColor: enabled
                    ? "color-mix(in srgb, var(--brand-accent,#E39A6E) 60%, transparent)"
                    : "var(--theme-card-border,#334155)",
                  background: enabled
                    ? "color-mix(in srgb, var(--brand-accent,#E39A6E) 22%, transparent)"
                    : "color-mix(in srgb, var(--theme-card-bg,#111827) 84%, black)",
                  color: enabled ? "var(--theme-text-primary,#F8FAFC)" : "var(--theme-text-secondary,#94A3B8)",
                }}
                aria-pressed={enabled}
                aria-label={`${enabled ? "Hide" : "Show"} ${widget.title} widget`}
              >
                {enabled ? "On" : "Off"} · {widget.title}
              </button>
            );
          })}
        </div>
      </div>

      {isSmallScreen ? (
        <div className="space-y-4">
          {visibleWidgets.map(({ item, widget }) => (
            <div key={item.id}>
              <DashboardWidgetShell title={widget.title} description={widget.description}>
                {widget.render(context, item)}
              </DashboardWidgetShell>
            </div>
          ))}
        </div>
      ) : (
        <div ref={containerRef as RefObject<HTMLDivElement>}>
          {mounted ? (
            <GridLayout
              className="dashboard-widget-grid"
              width={Math.max(width, 320)}
              gridConfig={{
                cols: DASHBOARD_GRID_COLUMNS,
                rowHeight: 96,
                margin: [16, 16],
                containerPadding: [0, 0],
              }}
              dragConfig={{
                enabled: true,
                handle: ".widget-drag-handle",
              }}
              resizeConfig={{
                enabled: true,
                handles: ["e", "s", "se"],
              }}
              layout={gridLayout}
              onLayoutChange={handleGridLayoutChange}
            >
              {visibleWidgets.map(({ item, widget }) => (
                <div key={item.id} className="h-full min-h-0">
                  <div className="relative flex h-full min-h-0 flex-col">
                    <button
                      type="button"
                      className="widget-drag-handle absolute right-2 top-2 z-10 cursor-move rounded-md border border-white/15 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-neutral-200"
                      aria-label={`Drag ${widget.title}`}
                    >
                      Move
                    </button>
                    <DashboardWidgetShell
                      title={widget.title}
                      description={widget.description}
                      className="min-h-0"
                      scrollClassName="pb-3"
                    >
                      {widget.render(context, item)}
                    </DashboardWidgetShell>
                  </div>
                </div>
              ))}
            </GridLayout>
          ) : (
            <div className="grid gap-4">
              {visibleWidgets.map(({ item, widget }) => (
                <div key={item.id}>
                  <DashboardWidgetShell title={widget.title} description={widget.description}>
                    {widget.render(context, item)}
                  </DashboardWidgetShell>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
