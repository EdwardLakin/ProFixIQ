"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";
import {
  FaClipboardList,
  FaTools,
  FaWrench,
  FaBoxes,
  FaComments,
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa";
import clsx from "clsx";

export default function RoleNavTech() {
    const supabase = createClientComponentClient<Database>();

  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [jobOpen, setJobOpen] = useState(true);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [messagingOpen, setMessagingOpen] = useState(false);

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

  if (role !== "mechanic") return null;

  const linkClass = (href: string) =>
    clsx(
      "flex items-center gap-2 px-4 py-2 rounded hover:bg-orange-600",
      pathname === href && "bg-orange-700 text-black",
    );

  const sectionHeader = (title: string, open: boolean, toggle: () => void) => (
    <button
      onClick={toggle}
      className="w-full flex items-center justify-between px-2 py-2 text-orange-500 font-bold"
    >
      <span>{title}</span>
      {open ? <FaChevronDown /> : <FaChevronRight />}
    </button>
  );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-4">
      <div>
        {sectionHeader("Jobs", jobOpen, () => setJobOpen(!jobOpen))}
        {jobOpen && (
          <div className="pl-2 space-y-1">
            <Link href="/tech/queue" className={linkClass("/tech/queue")}>
              <FaClipboardList /> Job Queue
            </Link>
            <Link
              href="/work-orders/view"
              className={linkClass("/work-orders/view")}
            >
              <FaTools /> Assigned Jobs
            </Link>
          </div>
        )}
      </div>

      <div>
        {sectionHeader("Inspections", inspectionOpen, () =>
          setInspectionOpen(!inspectionOpen),
        )}
        {inspectionOpen && (
          <div className="pl-2 space-y-1">
            <Link href="/maintenance50" className={linkClass("/maintenance50")}>
              <FaWrench /> Maintenance 50
            </Link>
            <Link href="/inspection" className={linkClass("/inspection")}>
              <FaWrench /> All Inspections
            </Link>
          </div>
        )}
      </div>

      <div>
        {sectionHeader("Parts", partsOpen, () => setPartsOpen(!partsOpen))}
        {partsOpen && (
          <div className="pl-2 space-y-1">
            <Link href="/parts" className={linkClass("/parts")}>
              <FaBoxes /> Parts Dashboard
            </Link>
          </div>
        )}
      </div>

      <div>
        {sectionHeader("Messaging", messagingOpen, () =>
          setMessagingOpen(!messagingOpen),
        )}
        {messagingOpen && (
          <div className="pl-2 space-y-1">
            <Link href="/ai/chat" className={linkClass("/ai/chat")}>
              <FaComments /> Chat
            </Link>
          </div>
        )}
      </div>

      {userId && (
        <div className="border-t border-gray-700 pt-4">
          <h2 className="text-orange-500 font-bold mb-2">Shift Tracker</h2>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}
