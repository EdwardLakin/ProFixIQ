"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import clsx from "clsx";
import { FaCogs, FaComments, FaChevronDown, FaChevronRight, FaTachometerAlt } from "react-icons/fa";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdvisor() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>("dashboard");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) return;
      setUserId(uid);
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).single();
      setRole(profile?.role ?? null);
    })();
  }, [supabase]);

  if (role !== "advisor") return null;

  const linkClass = (href: string) =>
    clsx("flex items-center gap-2 px-4 py-2 rounded hover:bg-orange-600", pathname === href && "bg-orange-700 text-black");

  const Toggle = ({ id, title }: { id: string; title: string }) => (
    <button
      onClick={() => setOpenSection((prev) => (prev === id ? null : id))}
      className="flex items-center justify-between w-full text-left text-orange-500 font-bold mb-2"
      aria-expanded={openSection === id}
    >
      <span className="flex items-center gap-2">{title}</span>
      {openSection === id ? <FaChevronDown /> : <FaChevronRight />}
    </button>
  );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6 text-sm md:text-base">
      {/* Dashboard */}
      <div>
        <Toggle id="dashboard" title={<><FaTachometerAlt /> Dashboard</> as any} />
        {openSection === "dashboard" && (
          <div className="space-y-1 ml-2">
            <Link href="/dashboard" className={linkClass("/dashboard")}>
              Overview
            </Link>
          </div>
        )}
      </div>

      {/* AI */}
      <div>
        <Toggle id="ai" title={<><FaCogs /> AI Assistant</> as any} />
        {openSection === "ai" && (
          <div className="space-y-1 ml-2">
            <Link href="/ai/assistant" className={linkClass("/ai/assistant")}>
              Expert Assistant
            </Link>
          </div>
        )}
      </div>

      {/* Messaging */}
      <div>
        <Toggle id="chat" title={<><FaComments /> Communication</> as any} />
        {openSection === "chat" && (
          <div className="space-y-1 ml-2">
            <Link href="/messages" className={linkClass("/messages")}>
              Team Messages
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
