// fea// features/shared/components/RoleNavOwner.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ShiftTracker from "@shared/components/ShiftTracker";
import { FaCogs, FaRegChartBar, FaUserPlus } from "react-icons/fa";
import { HiMenuAlt2 } from "react-icons/hi";

type Role = Database["public"]["Enums"]["user_role_enum"] | null;

export default function RoleNavOwner() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<Role>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

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

      setRole((profile?.role as Role) ?? null);
    })();
  }, [supabase]);

  if (role !== "owner") return null;

  return (
    <>
      {/* Mobile Toggle */}
      <div className="flex items-center justify-between bg-neutral-900 p-4 text-white md:hidden">
        <span className="text-lg font-bold text-orange-500">Menu</span>
        <button onClick={() => setMobileOpen((v) => !v)}>
          <HiMenuAlt2 size={28} />
        </button>
      </div>

      {/* Sidebar (owner utilities only) */}
      <nav
        className={`w-full space-y-6 bg-neutral-900 p-4 text-white md:block md:w-64 ${
          mobileOpen ? "block" : "hidden"
        }`}
      >
        {/* ---- AI Tools ---- */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
            <FaCogs /> AI Tools
          </div>
          <Link href="/ai/assistant" className="block hover:text-orange-400">
            Tech Assistant
          </Link>
        </div>

        {/* ---- Scheduling Client (new tile) ---- */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
            Scheduling
          </div>
          <Link
            href="/dashboard/admin/schedulingclient"
            className="block hover:text-orange-400"
          >
            Scheduling Client
          </Link>
        </div>

        {/* ---- Settings & Reports ---- */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
            <FaRegChartBar /> Settings & Reports
          </div>
          <Link href="/dashboard/owner/reports" className="block hover:text-orange-400">
            Reports
          </Link>
          <Link href="/dashboard/owner/settings" className="block hover:text-orange-400">
            Settings
          </Link>
          <Link href="/dashboard/owner/import-customers" className="block hover:text-orange-400">
            Import Customers
          </Link>
          <Link href="/compare-plans" className="block hover:text-orange-400">
            Plan & Billing
          </Link>
        </div>

        {/* ---- Management ---- */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
            <FaUserPlus /> Management
          </div>
          <Link href="/dashboard/owner/create-user" className="block hover:text-orange-400">
            Create User
          </Link>
        </div>

        {/* ---- Shift Tracker ---- */}
        {userId ? (
          <div className="mt-6 border-t border-gray-800 pt-4">
            <h2 className="mb-2 font-bold text-orange-500">Shift Tracker</h2>
            <ShiftTracker userId={userId} />
          </div>
        ) : null}
      </nav>
    </>
  );
}