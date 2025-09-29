"use client";

import { useWidgetLayout } from "@/features/widgets/useWidgetLayout";
import { widgetsBySlug } from "@/features/widgets/registry";

export default function WidgetGrid() {
  const { instances } = useWidgetLayout();
  if (!instances.length) return null;

  return (
    <div className="mb-4 grid grid-cols-4 gap-3">
      {instances.map((inst) => {
        const def = widgetsBySlug[inst.slug];
        if (!def) return null;

        const cls =
          inst.size === "1x1"
            ? "col-span-1 row-span-1"
            : inst.size === "2x1"
            ? "col-span-2 row-span-1"
            : "col-span-2 row-span-2";

        const Comp = def.Component;
        return (
          <div
            key={inst.instanceId}
            className={`${cls} rounded-2xl bg-white/8 p-3 backdrop-blur ring-1 ring-white/10`}
          >
            <Comp
              data={inst.data}
              size={inst.size}
              config={inst.config}
              route={def.route}
            />
          </div>
        );
      })}
    </div>
  );
}
