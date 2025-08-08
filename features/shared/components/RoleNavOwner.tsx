"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import ShiftTracker from "@shared/components/ShiftTracker";
import {
  FaTools,
  FaCogs,
  FaClipboardList,
  FaBoxOpen,
  FaRegChartBar,
  FaUserPlus,
  FaWrench,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import { HiMenuAlt2 } from "react-icons/hi";

export default function RoleNavOwner() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      setUserId(session.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      setRole(profile?.role ?? null);
    };
    fetchRole();
  }, [supabase]);

  if (role !== "owner") return null;

  const toggleSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const NavSection = ({
    title,
    icon,
    sectionKey,
    children,
  }: {
    title: string;
    icon: React.ReactNode;
    sectionKey: string;
    children: React.ReactNode;
  }) => (
    <div>
      <button
        onClick={() => toggleSection(sectionKey)}
        className="flex items-center justify-between w-full text-left text-white hover:text-orange-400 font-semibold"
      >
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
        {openSection === sectionKey ? <FaChevronUp /> : <FaChevronDown />}
      </button>
      {openSection === sectionKey && (
        <div className="mt-2 pl-4 space-y-1">{children}</div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <div className="md:hidden bg-neutral-900 text-white p-4 flex justify-between items-center">
        <span className="text-lg font-bold text-orange-500">Menu</span>
        <button onClick={() => setMobileOpen((prev) => !prev)}>
          <HiMenuAlt2 size={28} />
        </button>
      </div>

      <nav
        className={`bg-neutral-900 p-4 text-white space-y-6 md:w-64 w-full md:block ${
          mobileOpen ? "block" : "hidden"
        }`}
      >
        <NavSection title="Work Orders" icon={<FaWrench />} sectionKey="work">
          <Link
            href="/work-orders/create"
            className="block hover:text-orange-400"
          >
            Create Work Order
          </Link>
          <Link
            href="/work-orders/queue"
            className="block hover:text-orange-400"
          >
            Job Queue
          </Link>
          <Link href="/work-orders" className="block hover:text-orange-400">
            All Work Orders
          </Link>
        </NavSection>

        <NavSection
          title="Inspections"
          icon={<FaClipboardList />}
          sectionKey="inspection"
        >
          <Link href="/inspection" className="block hover:text-orange-400">
            Inspection Menu
          </Link>
          <Link href="/maintenance50" className="block hover:text-orange-400">
            Maintenance 50
          </Link>
          <Link
            href="/inspection/custom-inspection"
            className="block hover:text-orange-400"
          >
            Custom Builder
          </Link>
          <Link
            href="/inspection/saved"
            className="block hover:text-orange-400"
          >
            Saved Inspections
          </Link>
          <Link
            href="/inspection/templates"
            className="block hover:text-orange-400"
          >
            Templates
          </Link>
        </NavSection>

        <NavSection
          title="Parts & Inventory"
          icon={<FaBoxOpen />}
          sectionKey="parts"
        >
          <Link href="/parts" className="block hover:text-orange-400">
            Parts Dashboard
          </Link>
        </NavSection>

        <NavSection
          title="Management"
          icon={<FaUserPlus />}
          sectionKey="management"
        >
          <Link
            href="/dashboard/owner/create-user"
            className="block hover:text-orange-400"
          >
            Create User
          </Link>
          <Link href="/dashboard/owner" className="block hover:text-orange-400">
            Owner Dashboard
          </Link>
        </NavSection>

        <NavSection
          title="Settings & Reports"
          icon={<FaRegChartBar />}
          sectionKey="settings"
        >
          <Link
            href="/dashboard/owner/reports"
            className="block hover:text-orange-400"
          >
            Reports
          </Link>
          <Link
            href="/dashboard/owner/settings"
            className="block hover:text-orange-400"
          >
            Settings
          </Link>
          <Link
            href="/dashboard/owner/import-customers"
            className="block hover:text-orange-400"
          >
            Import Customers
          </Link>
          <Link href="/compare-plans" className="block hover:text-orange-400">
            Plan & Billing
          </Link>
        </NavSection>

        <NavSection title="AI Tools" icon={<FaCogs />} sectionKey="ai">
          <Link href="/ai/photo" className="block hover:text-orange-400">
            AI Photo
          </Link>
          <Link href="/ai/dtc" className="block hover:text-orange-400">
            DTC Decoder
          </Link>
          <Link href="/ai/chat" className="block hover:text-orange-400">
            AI Chat
          </Link>
        </NavSection>

        <NavSection title="Tech Tools" icon={<FaTools />} sectionKey="tech">
          <Link href="/tech/queue" className="block hover:text-orange-400">
            Tech Job Queue
          </Link>
        </NavSection>

        {userId && (
          <div className="mt-6 border-t border-gray-800 pt-4">
            <h2 className="text-orange-500 font-bold mb-2">Shift Tracker</h2>
            <ShiftTracker userId={userId} />
          </div>
        )}
      </nav>
    </>
  );
}
