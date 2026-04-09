"use client";

import { useEffect, useMemo, useState } from "react";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import {
  DASHBOARD_GRID_COLUMNS,
  buildDefaultDashboardLayout,
} from "@/features/dashboard/lib/defaultLayout";
import { getDashboardWidgetRegistry } from "@/features/dashboard/lib/widget-registry";
import type {
  DashboardRenderContext,
  DashboardWidgetLayout,
} from "@/features/dashboard/types/layout";
import type { DashboardWidgetModule } from "@/features/dashboard/types/widget";

type Props = {
  role: string | null;
  context: DashboardRenderContext;
};

function compareLayoutPosition(a: DashboardWidgetLayout, b: DashboardWidgetLayout): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return a.id.localeCompare(b.id);
}

export default function DashboardWidgetBoard({ role, context }: Props) {
  const registry = useMemo(() => getDashboardWidgetRegistry(role), [role]);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsSmallScreen(query.matches);

    update();
    query.addEventListener("change", update);

    return () => query.removeEventListener("change", update);
  }, []);

  const widgetById = useMemo(
    () => new Map(registry.map((widget) => [widget.id, widget] as const)),
    [registry],
  );

  const layout = useMemo(
    () => buildDefaultDashboardLayout(registry).sort(compareLayoutPosition),
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
        ),
    [layout, widgetById],
  );

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
          Stable default grid on desktop with automatic stacking on small screens.
        </div>
      </div>

      <div
        className={isSmallScreen ? "space-y-4" : "grid gap-4"}
        style={
          isSmallScreen
            ? undefined
            : {
                gridTemplateColumns: `repeat(${DASHBOARD_GRID_COLUMNS}, minmax(0, 1fr))`,
                gridAutoRows: "92px",
              }
        }
      >
        {orderedWidgets.map(({ item, widget }) => (
          <div
            key={item.id}
            style={
              isSmallScreen
                ? undefined
                : {
                    gridColumn: `${item.x + 1} / span ${item.w}`,
                    gridRow: `${item.y + 1} / span ${item.h}`,
                  }
            }
          >
            <DashboardWidgetShell title={widget.title} description={widget.description}>
              {widget.render(context, item)}
            </DashboardWidgetShell>
          </div>
        ))}
      </div>
    </div>
  );
}
