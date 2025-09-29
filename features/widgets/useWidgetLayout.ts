// features/widgets/useWidgetLayout.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
export type WidgetInstance = {
  instanceId: string;
  slug: string;
  size: "1x1" | "2x1" | "2x2";
  x: number;
  y: number;
  config: Record<string, any>;
  data?: any;
};

export function useWidgetLayout() {
  const supabase = createClientComponentClient<DB>();
  const [instances, setInstances] = useState<WidgetInstance[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: row } = await supabase
        .from("user_widget_layouts")
        .select("layout")
        .eq("user_id", user.id)
        .single();

      const grid = (row?.layout?.grid ?? []) as WidgetInstance[];
      setInstances(grid);
    })();
  }, [supabase]);

  const save = useCallback(
    async (grid: WidgetInstance[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setInstances(grid);
      await supabase
        .from("user_widget_layouts")
        .upsert({ user_id: user.id, layout: { grid, cols: 4, pages: 1 } });
    },
    [supabase]
  );

  return { instances, save };
}