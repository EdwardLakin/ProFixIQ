"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ChatDock from "@/features/chat/components/ChatDock";
import ShiftTracker from "@shared/components/ShiftTracker";
import { FaComments, FaRobot, FaChartBar, FaUserPlus, FaCogs, FaCreditCard } from "react-icons/fa";

type Db = Database;
type Role = Db["public"]["Enums"]["user_role_enum"] | null;

export default function RoleNavOwner() {
  const supabase = createClientComponentClient<Db>();
  const [role, setRole] = useState<Role>(null);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? "";
      if (!uid) return;
      setUserId(uid);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      setRole((profile?.role as Role) ?? null);
    })();
  }, [supabase]);

  // Only render for owners
  if (role !== "owner") return null;

  return (
    <nav className="space-y-6">
      {/* UTILITIES */}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">UTILITIES</h3>

        {/* Tech Assistant (opens drawer in /app/dashboard/layout.tsx) */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-tech-assistant"))}
          className="mb-2 flex w-full items-center justify-between rounded border border-white/15 bg-neutral-800 px-3 py-2 text-sm hover:border-orange-500"
        >
          <span className="flex items-center gap-2">
            <FaRobot /> Tech Assistant
          </span>
        </button>

        {/* Team Chat (inline drawer via ChatDock) */}
        <div className="rounded border border-white/15 bg-neutral-800 p-2">
          <div className="mb-2 flex items-center gap-2 text-sm text-neutral-200">
            <FaComments /> Team Chat
          </div>
          <ChatDock />
        </div>
      </section>

      {/* SETTINGS */}
      <section>
        <h3 className="mb-2 mt-4 text-xs font-semibold tracking-wide text-neutral-400">SETTINGS</h3>

        <ul className="space-y-1 text-sm">
          <li>
            <Link href="/dashboard/owner/settings" className="block rounded px-3 py-2 hover:bg-neutral-800">
              <span className="inline-flex items-center gap-2">
                <FaCogs /> Owner Settings
              </span>
            </Link>
          </li>
          <li>
            <Link href="/dashboard/owner/reports" className="block rounded px-3 py-2 hover:bg-neutral-800">
              <span className="inline-flex items-center gap-2">
                <FaChartBar /> Reports
              </span>
            </Link>
          </li>
          <li>
            <Link href="/dashboard/owner/create-user" className="block rounded px-3 py-2 hover:bg-neutral-800">
              <span className="inline-flex items-center gap-2">
                <FaUserPlus /> Create User
              </span>
            </Link>
          </li>
          <li>
            <Link href="/compare-plans" className="block rounded px-3 py-2 hover:bg-neutral-800">
              <span className="inline-flex items-center gap-2">
                <FaCreditCard /> Plan &amp; Billing
              </span>
            </Link>
          </li>
        </ul>
      </section>

      {/* SHIFT TRACKER */}
      {userId && (
        <section className="mt-6 border-t border-neutral-800 pt-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-400">SHIFT TRACKER</h3>
          <ShiftTracker userId={userId} />
        </section>
      )}
    </nav>
  );
}