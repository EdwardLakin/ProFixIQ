"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ShiftTracker from "@shared/components/ShiftTracker";

import { FaRegChartBar } from "react-icons/fa";

type Role = Database["public"]["Enums"]["user_role_enum"] | null;

export default function RoleNavOwner() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<Role>(null);
  const [userId, setUserId] = useState<string | null>(null);

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
        .maybeSingle();

      setRole((profile?.role as Role) ?? null);
    })();
  }, [supabase]);

  if (role !== "owner") return null;

  return (
    <nav className="w-full space-y-6 text-white">
      {/* Utilities */}
      <div>
        <h3 className="text-sm font-bold text-orange-500 mb-2">Utilities</h3>
        <div className="space-y-2">
          <Link href="/ai/assistant" className="block hover:text-orange-400">Tech Assistant</Link>
          <Link href="/messages" className="block hover:text-orange-400">Team Messages</Link>
        </div>
      </div>


      {/* Settings & Admin */}
      <div>
        <h3 className="text-sm font-bold text-orange-500 mb-2">Settings</h3>
        <div className="space-y-2">
          <Link href="/dashboard/owner/settings" className="block hover:text-orange-400">Owner Settings</Link>
          <Link href="/dashboard/owner/reports" className="block hover:text-orange-400"><FaRegChartBar className="inline mr-2" />Reports</Link>
          <Link href="/dashboard/owner/create-user" className="block hover:text-orange-400">Create User</Link>
          <Link href="/compare-plans" className="block hover:text-orange-400">Plan & Billing</Link>
        </div>
      </div>

      {userId && (
        <div className="mt-6 border-t border-gray-800 pt-4">
          <h2 className="mb-2 font-bold text-orange-500">Shift Tracker</h2>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}