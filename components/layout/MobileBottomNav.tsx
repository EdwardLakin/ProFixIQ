// components/layout/MobileBottomNav.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ShiftStatus = "none" | "active" | "ended";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/mobile", label: "Home" },
  { href: "/mobile/work-orders", label: "Jobs" },
  { href: "/mobile/messages", label: "Chat" },
  { href: "/mobile/settings", label: "Me" },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const supabase = createClientComponentClient<DB>();

  const [userId, setUserId] = useState<string | null>(null);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [busy, setBusy] = useState(false);

  // Load current user + check if they have an open shift (day punch)
  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const id = session?.user?.id ?? null;
      setUserId(id);

      if (!id) {
        setShiftStatus("none");
        return;
      }

      const { data: openShift } = await supabase
        .from("tech_shifts")
        .select("id")
        .eq("user_id", id)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      setShiftStatus(openShift ? "active" : "none");
    };

    void load();
  }, [supabase]);

  const handleToggleShift = useCallback(async () => {
    if (!userId || busy) return;

    setBusy(true);
    try {
      if (shiftStatus === "active") {
        // End the most recent open shift for this user
        const { data: openShift } = await supabase
          .from("tech_shifts")
          .select("id")
          .eq("user_id", userId)
          .is("end_time", null)
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openShift?.id) {
          await supabase
            .from("tech_shifts")
            .update({
              end_time: new Date().toISOString(),
              status: "completed",
            } as DB["public"]["Tables"]["tech_shifts"]["Update"])
            .eq("id", openShift.id);
        }

        setShiftStatus("ended");
      } else {
        // Start a new day shift
        await supabase
          .from("tech_shifts")
          .insert({
            user_id: userId,
            start_time: new Date().toISOString(),
            type: "shift",
            status: "active",
          } as DB["public"]["Tables"]["tech_shifts"]["Insert"]);

        setShiftStatus("active");
      }
    } finally {
      setBusy(false);
    }
  }, [busy, shiftStatus, supabase, userId]);

  const punchLabel =
    shiftStatus === "active"
      ? busy
        ? "Ending shift…"
        : "End shift"
      : busy
      ? "Starting shift…"
      : "Start shift";

  const statusLabel =
    shiftStatus === "active"
      ? "On shift"
      : shiftStatus === "ended"
      ? "Shift ended"
      : "Off shift";

  return (
    <nav className="border-t border-border bg-background/95 backdrop-blur-md">
      {/* Small day-punch strip */}
      <button
        type="button"
        onClick={handleToggleShift}
        disabled={!userId || busy}
        className="flex w-full items-center justify-between px-4 py-1.5 text-[11px] text-neutral-100 bg-gradient-to-r from-orange-600 to-orange-500 shadow-[0_-4px_10px_rgba(0,0,0,0.7)] disabled:opacity-60"
      >
        <span className="font-semibold uppercase tracking-[0.16em]">
          {punchLabel}
        </span>
        <span className="rounded-full border border-orange-200/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-orange-50 bg-black/10">
          {statusLabel}
        </span>
      </button>

      {/* Main bottom nav */}
      <div className="flex h-12 items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isRoot = item.href === "/mobile";
          const active = isRoot
            ? pathname === "/mobile"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center text-[11px] ${
                active ? "font-semibold text-white" : "text-muted-foreground"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileBottomNav;