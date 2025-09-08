"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import clsx from "clsx";
import { FaCogs, FaChevronDown, FaChevronRight, FaTachometerAlt, FaWrench } from "react-icons/fa";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavParts() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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

  if (role !== "parts") return null;

  const linkClass = (href: string) =>
    clsx("flex items-center gap-2 px-4 py-2 rounded hover:bg-orange-600", pathname === href && "bg-orange-700 text-black");

  const Toggle = ({ title }: { id: string; title: React.ReactNode }) => {
    const [open, setOpen] = useState(true);
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-2 py-2 text-orange-500 font-bold"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">{title}</span>
          {open ? <FaChevronDown /> : <FaChevronRight />}
        </button>
        {open && <div className="pl-2 space-y-1">
          <Link href="/dashboard" className={linkClass("/dashboard")}>Overview</Link>
          <Link href="/ai/assistant" className={linkClass("/ai/assistant")}><FaCogs /> AI Assistant</Link>
          <Link href="/messages" className={linkClass("/messages")}>Team Messages</Link>
        </div>}
      </div>
    );
  };

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-4">
      <Toggle id="main" title={<><FaTachometerAlt /> Dashboard</>} />
      <div className="border-t border-gray-800 pt-4">
        <h2 className="text-orange-500 font-bold mb-2 flex items-center gap-2"><FaWrench /> Utilities</h2>
        <div className="space-y-1">
          {/* Add future parts-specific settings pages here */}
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
