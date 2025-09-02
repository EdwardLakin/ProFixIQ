// features/shared/components/RoleNavManager.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import {
  FaClipboardList,  // work orders
  FaUserCheck,      // assignments
  FaWrench,         // inspections / actions
  FaBoxes,          // parts
  FaComments,       // messaging
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa";
import clsx from "clsx";

export default function RoleNavManager() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [ordersOpen, setOrdersOpen] = useState(true);
  const [inspectionsOpen, setInspectionsOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [messagingOpen, setMessagingOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (!uid) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();

      setRole(profile?.role ?? null);
    })();
  }, [supabase]);

  // Gate: only show to manager-ish roles
  const allowed = useMemo(
    () => new Set(["manager", "advisor", "owner", "admin"]),
    []
  );
  if (!role || !allowed.has(role)) return null;

  const linkClass = (href: string) =>
    clsx(
      "flex items-center gap-2 px-4 py-2 rounded hover:bg-orange-600",
      pathname === href && "bg-orange-700 text-black"
    );

  const Section = ({
    title,
    open,
    toggle,
    children,
  }: {
    title: string;
    open: boolean;
    toggle: () => void;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-2 py-2 text-orange-500 font-bold"
        aria-expanded={open}
      >
        <span>{title}</span>
        {open ? <FaChevronDown /> : <FaChevronRight />}
      </button>
      {open && <div className="pl-2 space-y-1">{children}</div>}
    </div>
  );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-4">
      <Section title="Work Orders" open={ordersOpen} toggle={() => setOrdersOpen(!ordersOpen)}>
        <Link href="/work-orders/create" className={linkClass("/work-orders/create")}>
          <FaWrench /> Create Work Order
        </Link>
        <Link href="/work-orders" className={linkClass("/work-orders")}>
          <FaClipboardList /> Orders List
        </Link>
        <Link href="/dashboard/manager" className={linkClass("/dashboard/manager")}>
          <FaUserCheck /> Assignments Board
        </Link>
        <Link href="/menu" className={linkClass("/menu")}>
          <FaWrench /> Service Menu
        </Link>
      </Section>

      <Section
        title="Inspections"
        open={inspectionsOpen}
        toggle={() => setInspectionsOpen(!inspectionsOpen)}
      >
        <Link href="/inspection" className={linkClass("/inspection")}>
          <FaWrench /> All Inspections
        </Link>
      </Section>

      <Section title="Parts" open={partsOpen} toggle={() => setPartsOpen(!partsOpen)}>
        <Link href="/parts" className={linkClass("/parts")}>
          <FaBoxes /> Parts Dashboard
        </Link>
      </Section>

      <Section
        title="Messaging"
        open={messagingOpen}
        toggle={() => setMessagingOpen(!messagingOpen)}
      >
        <Link href="/ai/chat" className={linkClass("/ai/chat")}>
          <FaComments /> Chat
        </Link>
      </Section>

      {userId && (
        <div className="border-t border-gray-700 pt-4 text-sm text-neutral-400">
          Signed in as <span className="font-semibold">{userId.slice(0, 8)}</span>
        </div>
      )}
    </nav>
  );
}