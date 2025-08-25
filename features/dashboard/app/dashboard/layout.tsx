// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useState } from "react";
import Navbar from "@shared/components/Navbar";
import DynamicRoleSidebar from "@shared/components/DynamicRoleSidebar";
import Calendar from "@shared/components/ui/Calendar";
import { TabsProvider } from "@shared/context/TabsProvider";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ShareBookingLink from "@dashboard/components/ShareBookingLink";
import type { Database } from "@shared/types/types/supabase";

type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts" | null;

// hoisted constants
const CALENDAR_ROLES: Exclude<Role, null>[] = ["owner", "admin", "manager", "advisor"];
const STAFF_ROLES:    Exclude<Role, null>[] = ["owner", "admin", "manager", "advisor", "parts"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient<Database>();

  // Sidebar calendar state
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Role gate
  const [role, setRole] = useState<Role>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingRole(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setRole(null);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!cancelled) setRole((profile?.role as Role) ?? null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setLoadingRole(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const showCalendar  = !loadingRole && !!role && CALENDAR_ROLES.includes(role);
  const showShareLink = !loadingRole && !!role && STAFF_ROLES.includes(role);

  return (
    <TabsProvider>
      <div className="min-h-screen bg-black text-white font-blackops">
        <Navbar />

        {/* Dashboard header row */}
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between border-b border-neutral-800">
          <h1 className="text-lg text-orange-400">
            {loadingRole ? "Loading…" : "Dashboard"}
          </h1>
          {showShareLink && <ShareBookingLink />}
        </div>

        <div className="flex">
          {/* Sidebar with role links and (conditionally) the calendar */}
          <aside className="hidden md:block w-64 bg-neutral-900 border-r border-neutral-800">
            <div className="sticky top-0 h-[calc(100dvh-64px)] overflow-y-auto p-3">
              <DynamicRoleSidebar />

              {showCalendar && (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">Calendar</h3>
                  <Calendar
                    className="shadow-inner"
                    month={month}
                    onMonthChange={setMonth}
                    value={selectedDate}
                    onChange={setSelectedDate}
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