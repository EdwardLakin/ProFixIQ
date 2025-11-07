"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";
import {
  FaCogs,
  FaClipboardList,
  FaCalendarAlt,
  FaUserCog,
  FaTachometerAlt,
} from "react-icons/fa";
import { HiMenuAlt2 } from "react-icons/hi";
import ChatDock from "@/features/chat/components/ChatDock";

export default function RoleNavTech() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) return;
      setUserId(uid);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();
      setRole(profile?.role ?? null);
    })();
  }, [supabase]);

  if (role !== "mechanic") return null;

  return (
    <>
      {/* Mobile Toggle */}
      <div className="flex items-center justify-between bg-neutral-900 p-4 text-white md:hidden">
        <span className="text-lg font-bold text-orange-500">Menu</span>
        <button onClick={() => setMobileOpen((v) => !v)}>
          <HiMenuAlt2 size={28} />
        </button>
      </div>

      {/* Sidebar */}
      <nav
        className={`w-full space-y-6 bg-neutral-900 p-4 text-white md:block md:w-64 ${
          mobileOpen ? "block" : "hidden"
        }`}
      >
        {/* Desktop → link to full chat */}
        <div className="hidden md:block">
          <Link href="/chat" className="block hover:text-orange-400">
            Open Messages
          </Link>
        </div>

        {/* Mobile → chat drawer */}
        <div className="md:hidden">
          <ChatDock />
        </div>

        {/* ---- Tech Tools ---- */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
            <FaTachometerAlt /> Tech
          </div>
          <Link href="/dashboard" className="block hover:text-orange-400">
            Dashboard
          </Link>
          <Link href="/tech/queue" className="block hover:text-orange-400">
            <FaClipboardList /> My Job Queue
          </Link>
          <Link href="/tech/calendar" className="block hover:text-orange-400">
            <FaCalendarAlt /> Shop Calendar
          </Link>
          <Link href="/dashboard/tech/settings" className="block hover:text-orange-400">
            <FaUserCog /> My Settings
          </Link>
        </div>

        {/* ---- AI Tools ---- */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
            <FaCogs /> AI Tools
          </div>
          <Link href="/ai/assistant" className="block hover:text-orange-400">
            Tech Assistant
          </Link>
        </div>

        {/* ---- Shift Tracker ---- */}
        {userId && (
          <div className="mt-6 border-t border-gray-800 pt-4">
            <h2 className="mb-2 font-bold text-orange-500">Shift Tracker</h2>
            <ShiftTracker userId={userId} />
          </div>
        )}
      </nav>
    </>
  );
}