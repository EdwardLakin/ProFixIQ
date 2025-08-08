"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  FaClipboardList,
  FaWrench,
  FaComments,
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa";
import clsx from "clsx";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdvisor() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [openSection, setOpenSection] = useState<string | null>("workorders");

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
      "flex items-center gap-2 px-4 py-2 rounded hover:bg-orange-600",
      pathname === href && "bg-orange-700 text-black",
    );

  const toggleSection = (section: string) =>
    setOpenSection((prev) => (prev === section ? null : section));

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6 text-sm md:text-base">
      {/* Work Orders */}
      <div>
        <button
          onClick={() => toggleSection("workorders")}
          className="flex items-center justify-between w-full text-left text-orange-500 font-bold mb-2"
        >
          <span className="flex items-center gap-2">
            <FaClipboardList /> Work Orders
          </span>
          {openSection === "workorders" ? (
            <FaChevronDown />
          ) : (
            <FaChevronRight />
          )}
        </button>
        {openSection === "workorders" && (
          <div className="space-y-1 ml-2">
            <Link
              href="/work-orders/create"
              className={linkClass("/work-orders/create")}
            >
              <FaWrench /> Create Work Order
            </Link>
            <Link
              href="/work-orders/queue"
              className={linkClass("/work-orders/queue")}
            >
              <FaClipboardList /> Job Queue
            </Link>
            <Link href="/work-orders" className={linkClass("/work-orders")}>
              <FaClipboardList /> All Work Orders
            </Link>
          </div>
        )}
      </div>

      {/* Advising */}
      <div>
        <button
          onClick={() => toggleSection("advising")}
          className="flex items-center justify-between w-full text-left text-orange-500 font-bold mb-2"
        >
          <span className="flex items-center gap-2">
            <FaWrench /> Advising
          </span>
          {openSection === "advising" ? <FaChevronDown /> : <FaChevronRight />}
        </button>
        {openSection === "advising" && (
          <div className="space-y-1 ml-2">
            <Link href="/inspections" className={linkClass("/inspections")}>
              <FaClipboardList /> Inspections
            </Link>
            <Link
              href="/dashboard/advisor"
              className={linkClass("/dashboard/advisor")}
            >
              <FaWrench /> Advisor Dashboard
            </Link>
          </div>
        )}
      </div>

      {/* Chat */}
      <div>
        <button
          onClick={() => toggleSection("chat")}
          className="flex items-center justify-between w-full text-left text-orange-500 font-bold mb-2"
        >
          <span className="flex items-center gap-2">
            <FaComments /> Communication
          </span>
          {openSection === "chat" ? <FaChevronDown /> : <FaChevronRight />}
        </button>
        {openSection === "chat" && (
          <div className="space-y-1 ml-2">
            <Link href="/ai/chat" className={linkClass("/ai/chat")}>
              <FaComments /> Chat
            </Link>
          </div>
        )}
      </div>

      {/* Shift Tracker */}
      {userId && (
        <div className="mt-6 border-t border-gray-800 pt-4">
          <h2 className="text-orange-500 font-bold mb-2">Shift Tracker</h2>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}
