"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2, X } from "lucide-react";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import { buildDefaultDashboardLayout } from "@/features/dashboard/lib/defaultLayout";
import { normalizeDashboardLayout } from "@/features/dashboard/lib/dashboard-layouts";
import { getDashboardWidgetRegistry } from "@/features/dashboard/lib/widget-registry";
import type {
  DashboardRenderContext,
  DashboardWidgetId,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

type Props = {
  role: string | null;
  context: DashboardRenderContext;
  initialLayout?: DashboardWidgetLayout[];
  onLayoutChange?: (nextLayout: DashboardWidgetLayout[]) => void;
};

type DashboardZoneKey = "top" | "primary" | "secondary" | "business";

type DashboardZoneConfig = {
  key: DashboardZoneKey;
  widgetIds: DashboardWidgetId[];
};

const MIN_WIDGET_HEIGHT = 3;
const MAX_WIDGET_HEIGHT = 7;

const DASHBOARD_ZONES: DashboardZoneConfig[] = [
  {
    key: "top",
    widgetIds: ["daily_summary", "shop_pulse", "suggested_actions"],
  },
  {
    key: "primary",
    widgetIds: ["work_order_board", "advisor_queue", "tech_load", "bookings"],
  },
  {
    key: "secondary",
    widgetIds: ["approval_risk", "waiting_parts", "comeback_risk", "live_shop_load"],
  },
  {
    key: "business",
    widgetIds: ["revenue_watch", "reports_performance", "stats_overview", "tech_performance", "optimization_opportunities"],
  },
];

function orderLayout(layout: DashboardWidgetLayout[]): DashboardWidgetLayout[] {
  return [...layout].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });
}

export default function DashboardWidgetBoard({
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
  const prevSerializedRef = useRef<string>(JSON.stringify(computedInitialLayout));

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

  const orderedWidgets = useMemo(
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

  const visibleWidgets = useMemo(
    () => orderedWidgets.filter(({ item }) => item.hidden !== true),
    [orderedWidgets],
  );

  const visibleById = useMemo(
    () => new Map(visibleWidgets.map((entry) => [entry.item.id, entry] as const)),
    [visibleWidgets],
  );

  const widgetZoneById = useMemo(() => {
    const zoneMap = new Map<DashboardWidgetId, DashboardZoneKey>();

    for (const zone of DASHBOARD_ZONES) {
      for (const widgetId of zone.widgetIds) {
        zoneMap.set(widgetId, zone.key);
      }
    }

    return zoneMap;
  }, []);

  const zoneEntries = useMemo(() => {
    const zoneBuckets = {
      top: [] as Array<{ item: DashboardWidgetLayout; widget: DashboardWidgetModule }>,
      primary: [] as Array<{ item: DashboardWidgetLayout; widget: DashboardWidgetModule }>,
      secondary: [] as Array<{ item: DashboardWidgetLayout; widget: DashboardWidgetModule }>,
      business: [] as Array<{ item: DashboardWidgetLayout; widget: DashboardWidgetModule }>,
    };

    for (const entry of visibleWidgets) {
      const zone = widgetZoneById.get(entry.item.id) ?? "business";
      zoneBuckets[zone].push(entry);
    }

    return zoneBuckets;
  }, [visibleWidgets, widgetZoneById]);

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

  const renderWidget = (
    item: DashboardWidgetLayout,
    widget: DashboardWidgetModule,
    emphasis: "dominant" | "normal" = "normal",
  ) => {
    const heightClass = item.id === "work_order_board"
      ? item.h >= 6
        ? "min-h-[28rem]"
        : "min-h-[24rem]"
      : item.h >= 5
        ? "min-h-[17rem]"
        : item.h >= 4
          ? "min-h-[14.5rem]"
          : "min-h-[12.5rem]";
    const emphasisClass = emphasis === "dominant" ? "ring-1 ring-[var(--brand-accent,#E39A6E)]/35" : "";

    return (
      <div key={item.id} className={`h-full min-h-0 ${heightClass}`}>
        <div className={`h-full min-h-0 ${emphasisClass}`}>
          {widget.selfContained ? (
            <div className="h-full min-h-0">{widget.render(context, item)}</div>
          ) : (
            <DashboardWidgetShell
              title={widget.title}
              description={widget.description}
              className="min-h-0"
              scrollClassName="pb-2"
            >
              {widget.render(context, item)}
            </DashboardWidgetShell>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setControlsOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:bg-black/40"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Layout controls
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
                  Command Center Layout
                </div>
                <div className="mt-1 text-xs text-neutral-300">
                  Toggle widgets and adjust compact heights. Changes persist automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setControlsOpen(false)}
                className="rounded-full border border-white/10 bg-black/30 p-1.5 text-neutral-200"
                aria-label="Close layout controls"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {orderedWidgets.map(({ item, widget }) => {
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

      <section className="space-y-2">
        <header>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Top Awareness Strip</h2>
        </header>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DASHBOARD_ZONES[0].widgetIds
            .map((id) => visibleById.get(id))
            .filter((entry): entry is { item: DashboardWidgetLayout; widget: DashboardWidgetModule } => Boolean(entry))
            .map(({ item, widget }) => renderWidget(item, widget))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-2">
          <header>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Primary Operations</h2>
          </header>
          <div className="grid gap-3 md:grid-cols-2">
            {zoneEntries.primary
              .filter(({ item }) => item.id === "work_order_board")
              .map(({ item, widget }) => (
                <div key={item.id} className="md:col-span-2">
                  {renderWidget(item, widget, "dominant")}
                </div>
              ))}

            {zoneEntries.primary
              .filter(({ item }) => item.id !== "work_order_board")
              .map(({ item, widget }) => renderWidget(item, widget))}
          </div>
        </div>

        <div className="space-y-2">
          <header>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Secondary Signals</h2>
          </header>
          <div className="grid gap-3">
            {zoneEntries.secondary.map(({ item, widget }) => renderWidget(item, widget))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <header>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Business & Performance</h2>
        </header>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {zoneEntries.business.map(({ item, widget }) => renderWidget(item, widget))}
        </div>
      </section>
    </div>
  );
}
