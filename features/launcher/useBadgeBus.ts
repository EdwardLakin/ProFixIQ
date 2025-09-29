"use client";

import { useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// What kinds of events we surface to the shell
export type BadgeKind = "message" | "work_order" | "notification";

/**
 * Subscribes to Supabase realtime changes and calls `onTick(kind)` whenever
 * a relevant event happens. We scope to three tables you showed earlier:
 *  - messages (INSERT)
 *  - work_orders (any event)
 *  - notifications (INSERT)
 */
export function useBadgeBus(
  onTick: (kind: BadgeKind) => void
): void {
  useEffect(() => {
    const supabase = createClientComponentClient<DB>();

    // Messages → "message"
    const chMsg = supabase
      .channel("pf-msg-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => onTick("message")
      )
      .subscribe();

    // Work Orders (create/update/delete) → "work_order"
    const chWO = supabase
      .channel("pf-wo-any")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => onTick("work_order")
      )
      .subscribe();

    // Notifications → "notification"
    const chNotif = supabase
      .channel("pf-notif-insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => onTick("notification")
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chMsg);
      supabase.removeChannel(chWO);
      supabase.removeChannel(chNotif);
    };
  }, [onTick]);
}