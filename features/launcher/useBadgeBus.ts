// features/launcher/useBadgeBus.ts
"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export function useBadgeBus(onTick: () => void) {
  useEffect(() => {
    const supabase = createClientComponentClient<DB>();

    const ch1 = supabase
      .channel("msg-ins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, onTick)
      .subscribe();

    const ch2 = supabase
      .channel("wo-any")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, onTick)
      .subscribe();

    const ch3 = supabase
      .channel("notif-ins")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, onTick)
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [onTick]);
}