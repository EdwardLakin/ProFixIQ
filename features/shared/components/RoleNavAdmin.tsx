"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  FaChartBar,
  FaUsers,
  FaCogs,
  FaWrench,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdmin() {
  const supabase = createBrowserClient<Database>();
  const [userId, setUserId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.id) setUserId(session.user.id);
    };
    fetchUser();
  }, [supabase]);

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <button
          onClick={() => toggleSection("reports")}
          className="flex items-center justify-between w-full text-left font-bold text-orange-500 mb-1"
        >
          <span className="flex items-center gap-2">
            <FaChartBar /> Reports
          </span>
          {openSection === "reports" ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {openSection === "reports" && (
          <div className="pl-4 space-y-1">
            <Link
              href="/dashboard/owner/reports"
              className="block hover:text-orange-400"
            >
              View Reports
            </Link>
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => toggleSection("users")}
          className="flex items-center justify-between w-full text-left font-bold text-orange-500 mb-1"
        >
          <span className="flex items-center gap-2">
            <FaUsers /> Users
          </span>
          {openSection === "users" ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {openSection === "users" && (
          <div className="pl-4 space-y-1">
            <Link
              href="/dashboard/owner/create-user"
              className="block hover:text-orange-400"
            >
              Manage Users
            </Link>
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => toggleSection("settings")}
          className="flex items-center justify-between w-full text-left font-bold text-orange-500 mb-1"
        >
          <span className="flex items-center gap-2">
            <FaCogs /> Settings
          </span>
          {openSection === "settings" ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {openSection === "settings" && (
          <div className="pl-4 space-y-1">
            <Link
              href="/dashboard/owner/settings"
              className="block hover:text-orange-400"
            >
              Shop Settings
            </Link>
            <Link href="/compare-plans" className="block hover:text-orange-400">
              Plan & Billing
            </Link>
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => toggleSection("parts")}
          className="flex items-center justify-between w-full text-left font-bold text-orange-500 mb-1"
        >
          <span className="flex items-center gap-2">
            <FaWrench /> Parts
          </span>
          {openSection === "parts" ? <FaChevronUp /> : <FaChevronDown />}
        </button>
        {openSection === "parts" && (
          <div className="pl-4 space-y-1">
            <Link href="/parts" className="block hover:text-orange-400">
              Parts Dashboard
            </Link>
          </div>
        )}
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
