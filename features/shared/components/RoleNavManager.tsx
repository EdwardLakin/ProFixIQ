"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import clsx from "clsx";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdvisor() {
    const supabase = createClientComponentClient<Database>();

  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      setUserId(uid);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();

      setRole(profile?.role ?? null);
    };

    fetchRole();
  }, [supabase]);

  if (role !== "advisor") return null;

  const linkClass = (href: string) =>
    clsx(
      "block px-4 py-2 rounded hover:bg-orange-600",
      pathname === href && "bg-orange-700 text-black",
    );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <h2 className="text-orange-500 font-bold mb-2">Work Orders</h2>
        <div className="space-y-1">
          <Link
            href="/work-orders/create"
            className={linkClass("/work-orders/create")}
          >
            Create Work Order
          </Link>
          <Link
            href="/work-orders/queue"
            className={linkClass("/work-orders/queue")}
          >
            Job Queue
          </Link>
          <Link href="/work-orders" className={linkClass("/work-orders")}>
            All Work Orders
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Advising</h2>
        <div className="space-y-1">
          <Link href="/inspections" className={linkClass("/inspections")}>
            Inspections
          </Link>
          <Link
            href="/dashboard/advisor"
            className={linkClass("/dashboard/advisor")}
          >
            Advisor Dashboard
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Settings</h2>
        <div className="space-y-1">
          <Link href="/compare-plans" className={linkClass("/compare-plans")}>
            Plan & Billing
          </Link>
        </div>
      </div>

      {userId && (
        <div className="mt-6 border-t border-gray-800 pt-4">
          <h2 className="text-orange-500 font-bold mb-2">Shift Tracker</h2>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}
