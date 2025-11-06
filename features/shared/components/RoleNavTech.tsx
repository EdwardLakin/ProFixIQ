"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import clsx from "clsx";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";

import {
  FaCogs,
  FaChevronDown,
  FaChevronRight,
  FaTachometerAlt,
  FaClipboardList,
  FaCalendarAlt,
  FaUserCog,
} from "react-icons/fa";

export default function RoleNavTech() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // fetch user + role once
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) return;

      setUserId(uid);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      setRole(profile?.role ?? null);
    })();
  }, [supabase]);

  // only render for mechanics/techs
  if (role !== "mechanic") return null;

  const linkClass = (href: string) =>
    clsx(
      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition",
      pathname === href
        ? "bg-orange-500 text-black"
        : "text-neutral-200 hover:bg-neutral-800"
    );

  // small collapsible section
  const Section = ({
    title,
    icon,
    children,
    defaultOpen = true,
  }: {
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
  }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="border border-neutral-900/60 rounded-lg bg-neutral-950/40">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold tracking-wide text-neutral-200"
        >
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          {open ? <FaChevronDown /> : <FaChevronRight />}
        </button>
        {open ? <div className="px-2 pb-2 space-y-1">{children}</div> : null}
      </div>
    );
  };

  return (
    <nav className="w-full space-y-4">
      {/* MAIN / QUICK */}
      <Section title="Tech" icon={<FaTachometerAlt className="text-orange-400" />}>
        <Link href="/dashboard" className={linkClass("/dashboard")}>
          <FaTachometerAlt /> Dashboard
        </Link>
        <Link href="/tech/queue" className={linkClass("/tech/queue")}>
          <FaClipboardList /> My Job Queue
        </Link>
        <Link href="/tech/calendar" className={linkClass("/tech/calendar")}>
          <FaCalendarAlt /> Shop Calendar
        </Link>
        <Link
          href="/dashboard/tech/settings"
          className={linkClass("/dashboard/tech/settings")}
        >
          <FaUserCog /> My Settings
        </Link>
      </Section>

      {/* AI / HELPERS */}
      <Section
        title="AI & Tools"
        icon={<FaCogs className="text-orange-400" />}
        defaultOpen={false}
      >
        <Link href="/ai/assistant" className={linkClass("/ai/assistant")}>
          <FaCogs /> Tech Assistant
        </Link>
      </Section>

      {/* SHIFT TRACKER */}
      {userId ? (
        <div className="mt-4 rounded-lg border border-neutral-900 bg-neutral-950 p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-400">
            Shift Tracker
          </h2>
          <ShiftTracker userId={userId} />
        </div>
      ) : null}
    </nav>
  );
}