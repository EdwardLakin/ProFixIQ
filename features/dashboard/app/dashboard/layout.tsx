"use client";

import React, { useEffect, useState } from "react";
import Navbar from "@shared/components/Navbar";
import DynamicRoleSidebar from "@shared/components/DynamicRoleSidebar";
import Calendar from "@shared/components/ui/Calendar";
import { TabsProvider } from "@shared/context/TabsProvider";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import ShareBookingLink from "@dashboard/components/ShareBookingLink";

type Role =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "parts"
  | null;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
    const supabase = createClientComponentClient<Database>();


  // Sidebar calendar state
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Role gate
  const [role, setRole] = useState<Role>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingRole(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoadingRole(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setRole((profile?.role as Role) ?? null);
      setLoadingRole(false);
    })();
  }, [supabase]);

  // Calendar shows only for these roles
  const calendarRoles: Exclude<Role, null>[] = [
    "owner",
    "admin",
    "manager",
    "advisor",
  ];
  const showCalendar = !loadingRole && !!role && calendarRoles.includes(role);

  // Staff roles for the "Share booking link" button
  const staffRoles: Exclude<Role, null>[] = [
    "owner",
    "admin",
    "manager",
    "advisor",
    "parts",
  ];
  const showShareLink = !loadingRole && !!role && staffRoles.includes(role);

  return (
    <TabsProvider>
      <div className="min-h-screen bg-black text-white font-blackops">
        <Navbar />

        {/* Dashboard header row */}
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between border-b border-neutral-800">
          <h1 className="text-lg text-orange-400">Dashboard</h1>
          {showShareLink && <ShareBookingLink />}
        </div>

        <div className="flex">
          {/* Sidebar with role links and (conditionally) the calendar */}
          <aside className="hidden md:block w-64 bg-neutral-900 border-r border-neutral-800">
            <div className="sticky top-0 h-[calc(100dvh-64px)] overflow-y-auto p-3">
              <DynamicRoleSidebar />

              {showCalendar && (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">
                    Calendar
                  </h3>
                  <Calendar
                    className="shadow-inner"
                    month={month}
                    onMonthChange={setMonth}
                    value={selectedDate}
                    onChange={setSelectedDate}
                    // disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                  />
                </div>
              )}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </TabsProvider>
  );
}