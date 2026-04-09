"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Responsive, type Layout, type LayoutItem } from "react-grid-layout";
import { LayoutGrid, RotateCcw, Save } from "lucide-react";

import DashboardWidgetShell from "@/features/dashboard/components/DashboardWidgetShell";
import {
  getDashboardWidgetRegistry,
  type DashboardWidgetRegistration,
} from "@/features/dashboard/lib/widget-registry";
import {
  buildDefaultDashboardLayout,
  mergeStoredLayoutWithRegistry,
} from "@/features/dashboard/lib/defaultLayout";
import type {
  DashboardLayoutItem,
  DashboardRenderContext,
  DashboardWidgetId,
} from "@/features/dashboard/types/layout";

type Props = {
  role: string | null;
  context: DashboardRenderContext;
};

function toGridLayout(items: DashboardLayoutItem[]): Layout {
  return items
    .filter((item) => !item.hidden)
    .map(
      (item): LayoutItem => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW,
        minH: item.minH,
        maxW: item.maxW,
        maxH: item.maxH,
      }),
    );
}

function mergeLayoutPosition(
  current: DashboardLayoutItem[],
  next: Layout,
): DashboardLayoutItem[] {
  const posById = new Map<string, LayoutItem>(
    Array.from(next).map((item) => [item.i, item]),
  );

  return current.map((item) => {
    const nextItem = posById.get(item.i);
    if (!nextItem) return item;

    return {
      ...item,
      x: nextItem.x,
      y: nextItem.y,
      w: nextItem.w,
      h: nextItem.h,
    };
  });
}

export default function DashboardWidgetBoard({ role, context }: Props) {
  const registry = useMemo(() => getDashboardWidgetRegistry(role), [role]);
  const defaultLayout = useMemo(
    () => buildDefaultDashboardLayout(registry),
    [registry],
  );

  const [items, setItems] = useState<DashboardLayoutItem[]>(defaultLayout);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [width, setWidth] = useState(1200);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => !item.hidden),
    [items],
  );

  const persistLayout = useCallback(
    async (nextItems: DashboardLayoutItem[]) => {
      setSaving(true);
      try {
        await fetch("/api/dashboard/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "desktop",
            layout: nextItems,
          }),
        });
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const next = Math.max(320, Math.floor(node.getBoundingClientRect().width));
      setWidth(next);
    };

    update();

    const observer = new ResizeObserver(() => update());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const res = await fetch("/api/dashboard/layout?scope=desktop", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        layout?: DashboardLayoutItem[];
      };

      if (!active) return;

      if (json?.ok && Array.isArray(json.layout)) {
        setItems(mergeStoredLayoutWithRegistry(defaultLayout, json.layout));
      } else {
        setItems(defaultLayout);
      }

      setLoaded(true);
    })();

    return () => {
      active = false;
    };
  }, [defaultLayout]);

  useEffect(() => {
    if (!loaded) return;

    const allowed = new Set(registry.map((item) => item.id));
    setItems((prev) => prev.filter((item) => allowed.has(item.i)));
  }, [loaded, registry]);

  const onLayoutCommit = useCallback(
    async (nextLayout: Layout) => {
      const merged = mergeLayoutPosition(items, nextLayout);
      setItems(merged);
      await persistLayout(merged);
    },
    [items, persistLayout],
  );

  const hideWidget = useCallback(
    async (id: DashboardWidgetId) => {
      const nextItems = items.map((item) =>
        item.i === id ? { ...item, hidden: true } : item,
      );
      setItems(nextItems);
      await persistLayout(nextItems);
    },
    [items, persistLayout],
  );

  const showWidget = useCallback(
    async (id: DashboardWidgetId) => {
      const nextItems = items.map((item) =>
        item.i === id ? { ...item, hidden: false } : item,
      );
      setItems(nextItems);
      await persistLayout(nextItems);
    },
    [items, persistLayout],
  );

  const resetLayout = useCallback(async () => {
    setItems(defaultLayout);
    await persistLayout(defaultLayout);
  }, [defaultLayout, persistLayout]);

  const hiddenIds = useMemo(
    () => new Set(items.filter((item) => item.hidden).map((item) => item.i)),
    [items],
  );

  const responsiveProps: any = {
    className: "pfq-rgl-layout",
    width,
    breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 },
    cols: { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 },
    layouts: { lg: toGridLayout(visibleItems) },
    rowHeight: 92,
    margin: [16, 16],
    containerPadding: [0, 0],
    compactType: "vertical",
    preventCollision: false,
    useCSSTransforms: true,
    isDraggable: editing,
    isResizable: editing,
    draggableHandle: ".pfq-widget-drag-handle",
    onDragStop: (layout: Layout) => void onLayoutCommit(layout),
    onResizeStop: (layout: Layout) => void onLayoutCommit(layout),
  };

  if (!loaded) {
    return (
      <div
        className="rounded-3xl border p-6"
        style={{
          borderColor: "var(--theme-card-border,#334155)",
          background: "var(--theme-card-bg,#111827)",
        }}
      >
        <div style={{ color: "var(--theme-text-secondary,#94A3B8)" }}>
          Loading dashboard layout…
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-4">
      <div
        className="rounded-3xl border px-4 py-3"
        style={{
          borderColor: "var(--theme-card-border,#334155)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--theme-card-bg,#111827) 92%, black), color-mix(in srgb, var(--brand-secondary,#0F172A) 58%, black))",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
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
              Compact by default. Drag, resize, hide, and reset as needed.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--brand-primary,#C1663B) 40%, transparent)",
                background: editing
                  ? "color-mix(in srgb, var(--brand-primary,#C1663B) 15%, var(--theme-card-bg,#111827))"
                  : "color-mix(in srgb, var(--theme-card-bg,#111827) 85%, black)",
                color: editing
                  ? "var(--brand-accent,#E39A6E)"
                  : "var(--theme-text-primary,#FFFFFF)",
              }}
            >
              <LayoutGrid className="h-4 w-4" />
              {editing ? "Done editing" : "Edit layout"}
            </button>

            <button
              type="button"
              onClick={() => void resetLayout()}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--theme-card-border,#334155) 88%, transparent)",
                background:
                  "color-mix(in srgb, var(--theme-card-bg,#111827) 85%, black)",
                color: "var(--theme-text-primary,#FFFFFF)",
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>

            <div
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--theme-card-border,#334155) 88%, transparent)",
                background:
                  "color-mix(in srgb, var(--theme-card-bg,#111827) 85%, black)",
                color: "var(--theme-text-secondary,#94A3B8)",
              }}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Saved automatically"}
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <div
          className="rounded-3xl border p-4"
          style={{
            borderColor: "var(--theme-card-border,#334155)",
            background: "var(--theme-card-bg,#111827)",
          }}
        >
          <div
            className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "var(--brand-accent,#E39A6E)" }}
          >
            Widget Picker
          </div>

          <div className="flex flex-wrap gap-2">
            {registry.map((widget) => {
              const hidden = hiddenIds.has(widget.id);

              return (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() =>
                    void (hidden ? showWidget(widget.id) : hideWidget(widget.id))
                  }
                  className="rounded-full border px-3 py-1.5 text-sm transition"
                  style={{
                    borderColor: hidden
                      ? "color-mix(in srgb, var(--theme-card-border,#334155) 85%, transparent)"
                      : "color-mix(in srgb, var(--brand-primary,#C1663B) 40%, transparent)",
                    background: hidden
                      ? "color-mix(in srgb, var(--theme-card-bg,#111827) 85%, black)"
                      : "color-mix(in srgb, var(--brand-primary,#C1663B) 14%, var(--theme-card-bg,#111827))",
                    color: hidden
                      ? "var(--theme-text-secondary,#94A3B8)"
                      : "var(--brand-accent,#E39A6E)",
                  }}
                >
                  {hidden ? `Show ${widget.title}` : `Hide ${widget.title}`}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Responsive {...responsiveProps}>
        {visibleItems.map((item) => {
          const widget = registry.find(
            (entry) => entry.id === item.i,
          ) as DashboardWidgetRegistration | undefined;

          if (!widget) return null;

          return (
            <div key={item.i} className="pfq-rgl-item">
              <DashboardWidgetShell
                title={widget.title}
                description={widget.description}
                editing={editing}
                onHide={() => void hideWidget(item.i)}
              >
                {widget.render(context, item)}
              </DashboardWidgetShell>
            </div>
          );
        })}
      </Responsive>
    </div>
  );
}
