// features/launcher/useBadgeBus.ts
"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// What kinds of events we surface to the UI
export type BadgeKind = "message" | "work_order" | "notification";

/**
 * Subscribes to Supabase realtime changes and calls `onTick(kind)`
 * whenever a relevant event happens.
 */
export function useBadgeBus(onTick: (kind: BadgeKind) => void) {
  const supabase = createClientComponentClient<DB>();

  useEffect(() => {
    // Messages → "message"
    const chMsgs = supabase
      .channel("pf-msg-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => onTick("message")
      )
      .subscribe();

    // Any work_orders change → "work_order"
    const chWO = supabase
      .channel("pf-wo-any")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => onTick("work_order")
      )
      .subscribe();

    // Notifications → "notification"
    const chNotifs = supabase
      .channel("pf-notif-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => onTick("notification")
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chMsgs);
      supabase.removeChannel(chWO);
      supabase.removeChannel(chNotifs);
    };
  }, [supabase, onTick]);
}