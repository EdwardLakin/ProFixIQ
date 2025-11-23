"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type TechShiftRow = DB["public"]["Tables"]["tech_shifts"]["Row"];

const navItems = [
  { href: "/mobile", label: "Home" },
  { href: "/mobile/work-orders", label: "Jobs" },
  { href: "/mobile/messages", label: "Chat" },
  { href: "/mobile/settings", label: "Me" },
];

type ShiftStatus = "none" | "active" | "ended";

export function MobileBottomNav() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [status, setStatus] = useState<ShiftStatus>("none");
  const [busy, setBusy] = useState(false);

  // Load current user + open shift (if any)
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const uid = session?.user?.id ?? null;
        setUserId(uid);
        if (!uid) {
          setShiftId(null);
          setStatus("none");
          return;
        }

        const { data: shift } = await supabase
          .from("tech_shifts")
          .select("id, end_time")
          .eq("user_id", uid)
          .is("end_time", null)
          .order("start_time", { ascending: false })
          .limit(1)
          .maybeSingle<TechShiftRow>();

        if (shift?.id) {
          setShiftId(shift.id);
          setStatus("active");
        } else {
          setShiftId(null);
          setStatus("none");
        }
      } catch (e) {
        console.error("[MobileBottomNav] failed to load shift", e);
      }
    })();
  }, [supabase]);

  const startShift = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      // guard: if there is already an open shift, just treat as active
      const { data: existing } = await supabase
        .from("tech_shifts")
        .select("id")
        .eq("user_id", userId)
        .is("end_time", null)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle<TechShiftRow>();

      if (existing?.id) {
        setShiftId(existing.id);
        setStatus("active");
        toast.message("You already have an active shift.");
        return;
      }

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("tech_shifts")
        .insert({
          user_id: userId,
          start_time: now,
          end_time: null,
          type: "shift",
          status: "active",
        })
        .select("id")
        .single<TechShiftRow>();

      if (error) throw error;

      setShiftId(data.id);
      setStatus("active");
      toast.success("Shift started for today.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to start shift.");
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, userId]);

  const endShift = useCallback(async () => {
    if (!userId || !shiftId || busy) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("tech_shifts")
        .update({ end_time: now, status: "completed" })
        .eq("id", shiftId);

      if (error) throw error;

      setShiftId(null);
      setStatus("ended");
      toast.success("Shift ended for today.");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to end shift.");
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, shiftId, userId]);

  const handleShiftClick = () => {
    if (!userId || busy) return;
    if (status === "active") {
      void endShift();
    } else {
      void startShift();
    }
  };

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur-md">
      {/* Compact day punch bar */}
      {userId && (
        <button
          type="button"
          onClick={handleShiftClick}
          disabled={busy}
          className={`mx-3 mt-1 mb-1 flex w-auto items-center justify-center rounded-full px-4 py-1.5 text-[11px] font-semibold shadow-lg transition
            ${
              status === "active"
                ? "bg-orange-600 text-black hover:bg-orange-500"
                : "bg-orange-500 text-black hover:bg-orange-400"
            }
            ${busy ? "opacity-60 cursor-not-allowed" : ""}
          `}
        >
          {busy
            ? "Saving…"
            : status === "active"
              ? "On shift – tap to end"
              : "Punch in for the day"}
        </button>
      )}

      {/* Tab bar */}
      <nav className="h-14 border-t border-border flex items-center justify-around bg-background/95 backdrop-blur-md">
        {navItems.map((item) => {
          const active =
            item.href === "/mobile"
              ? pathname === "/mobile"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center text-[11px] ${
                active ? "font-semibold text-white" : "text-muted-foreground"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}