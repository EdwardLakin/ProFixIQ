// features/shared/components/RoleNavAdmin.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import {
  FaUsers,       // People
  FaIdBadge,     // Create User / Roles
  FaFolderOpen,  // Employee Docs
  FaCertificate, // Certifications
  FaCalendarAlt, // Scheduling
  FaSitemap,     // Teams / Org
  FaStore,       // Shops
  FaMoneyBill,   // Billing
  FaShieldAlt,   // Audit
  FaCogs,        // AI / Tools
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function RoleNavAdmin() {
  const supabase = createClientComponentClient<Database>();
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>("people");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) setUserId(session.user.id);
    })();
  }, [supabase]);

  const toggle = (key: string) => setOpen((p) => (p === key ? null : key));

  const Section = ({
    title,
    icon,
    id,
    children,
  }: {
    title: string;
    icon: React.ReactNode;
    id: string;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        onClick={() => toggle(id)}
        className="flex w-full items-center justify-between text-left font-bold text-orange-500 mb-1"
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        {open === id ? <FaChevronUp /> : <FaChevronDown />}
      </button>
      {open === id && <div className="pl-4 space-y-1">{children}</div>}
    </div>
  );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      {/* People & HR */}
      <Section title="People & HR" icon={<FaUsers />} id="people">
        <Link href="/dashboard/admin/employees" className="block hover:text-orange-400">
          Employees
        </Link>
        <Link href="/dashboard/admin/create-user" className="block hover:text-orange-400">
          <span className="inline-flex items-center gap-2"><FaIdBadge />Create User</span>
        </Link>
        <Link href="/dashboard/admin/employee-docs" className="block hover:text-orange-400">
          <span className="inline-flex items-center gap-2"><FaFolderOpen />Employee Documents</span>
        </Link>
        <Link href="/dashboard/admin/certifications" className="block hover:text-orange-400">
          <span className="inline-flex items-center gap-2"><FaCertificate />Certifications</span>
        </Link>
        <Link href="/dashboard/admin/scheduling" className="block hover:text-orange-400">
          <span className="inline-flex items-center gap-2"><FaCalendarAlt />Scheduling</span>
        </Link>
      </Section>

      {/* Org & Access */}
      <Section title="Org & Access" icon={<FaSitemap />} id="org">
        <Link href="/dashboard/admin/roles" className="block hover:text-orange-400">
          Roles
        </Link>
        <Link href="/dashboard/admin/teams" className="block hover:text-orange-400">
          Teams
        </Link>
      </Section>

      {/* Business */}
      <Section title="Business" icon={<FaStore />} id="business">
        <Link href="/dashboard/admin/shops" className="block hover:text-orange-400">
          Shops
        </Link>
        <Link href="/dashboard/admin/billing" className="block hover:text-orange-400">
          <span className="inline-flex items-center gap-2"><FaMoneyBill />Billing</span>
        </Link>
      </Section>

      {/* System */}
      <Section title="System" icon={<FaShieldAlt />} id="system">
        <Link href="/dashboard/admin/audit" className="block hover:text-orange-400">
          Audit Logs
        </Link>
      </Section>

      {/* Tools */}
      <Section title="Tools" icon={<FaCogs />} id="tools">
        <Link href="/ai/assistant" className="block hover:text-orange-400">
          AI Assistant
        </Link>
        {/* If you keep a messages page, expose it here too
        <Link href="/messages" className="block hover:text-orange-400">
          Messages
        </Link> */}
      </Section>

      {userId && (
        <div className="mt-6 border-top border-gray-800 pt-4">
          <h2 className="text-orange-500 font-bold mb-2">Shift Tracker</h2>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}