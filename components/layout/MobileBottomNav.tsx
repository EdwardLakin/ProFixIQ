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

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MobileBottomNav({ open, onClose }: Props) {
  const pathname = usePathname();
  const supabase = createClientComponentClient<DB>();

  const [userId, setUserId] = useState<string | null>(null);
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus>("none");
  const [busy, setBusy] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* Load current user + check for open shift                                */
  /* ---------------------------------------------------------------------- */
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

  /* ---------------------------------------------------------------------- */
  /* Punch in/out logic – EXACT same as existing bottom nav                  */
  /* ---------------------------------------------------------------------- */
  const handleToggleShift = useCallback(async () => {
    if (!userId || busy) return;

    setBusy(true);
    try {
      if (shiftStatus === "active") {
        // End shift
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
        // Start new shift
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

  /* ---------------------------------------------------------------------- */
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

  /* ---------------------------------------------------------------------- */
  /* UI – Slide-in drawer                                                    */
  /* ---------------------------------------------------------------------- */
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Side drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[80%] transform shadow-[12px_0_35px_rgba(0,0,0,0.9)] transition-transform duration-200 bg-[#050910] border-r border-[var(--metal-border-soft)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="metal-bar flex items-center justify-between px-4 py-3 border-b border-[var(--metal-border-soft)]">
          <div className="flex flex-col">
            <span className="font-blackops text-[0.65rem] tracking-[0.24em] text-[var(--accent-copper-light)]">
              PROFIXIQ
            </span>
            <span className="text-[0.7rem] text-neutral-300">Mobile Bench</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/50 hover:bg-black/70 active:scale-95"
          >
            ✕
          </button>
        </div>

        {/* Punch button (EXACT original code) */}
        <button
          type="button"
          onClick={handleToggleShift}
          disabled={!userId || busy}
          className="flex items-center justify-between px-4 py-2 text-[11px] text-neutral-100 bg-gradient-to-r from-[var(--accent-copper-soft)] to-[var(--accent-copper)] shadow-[0_4px_14px_rgba(0,0,0,0.85)] disabled:opacity-60"
        >
          <span className="font-semibold uppercase tracking-[0.16em]">
            {punchLabel}
          </span>

          <span className="accent-chip px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
            {statusLabel}
          </span>
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isRoot = item.href === "/mobile";
              const active = isRoot
                ? pathname === "/mobile"
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`metal-card block rounded-xl px-3 py-2 text-sm transition ${
                    active
                      ? "border-[var(--accent-copper)] text-white"
                      : "border-[var(--metal-border-soft)] text-neutral-200 hover:border-[var(--accent-copper-light)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--metal-border-soft)] px-4 py-2 text-[0.65rem] text-neutral-500">
          <div>Tech Mode</div>
          <div className="text-[0.6rem] text-neutral-600">v0.1 • Early Build</div>
        </div>
      </aside>
    </>
  );
}

export default MobileBottomNav;