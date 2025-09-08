"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import Calendar from "@shared/components/ui/Calendar";
import DynamicRoleSidebar from "@shared/components/DynamicRoleSidebar";

import { TabsProvider } from "@/features/shared/components/tabs/TabsProvider";
import TabsBar from "@/features/shared/components/tabs/TabsBar";
import ChatDock from "@/features/chat/components/ChatDock";

const TechAssistant = dynamic(
  () => import("@/features/shared/components/TechAssistant"),
  { ssr: false }
);

// Typed role from DB enum
type Role = Database["public"]["Enums"]["user_role_enum"] | null;

const CALENDAR_ROLES: ReadonlyArray<NonNullable<Role>> = [
  "owner",
  "admin",
  "manager",
  "advisor",
];
const STAFF_ROLES: ReadonlyArray<NonNullable<Role>> = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "parts",
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient<Database>();

  const [role, setRole] = useState<Role>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  // calendar
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // assistant drawer
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [currentVehicle] = useState<{ year?: string; make?: string; model?: string } | null>(null);
  const [currentWorkOrderLineId] = useState<string | null>(null);

  // fetch role once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingRole(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setRole(null);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!cancelled) setRole((profile?.role as Role) ?? null);
      } finally {
        if (!cancelled) setLoadingRole(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ESC closes assistant
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAssistantOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showCalendar = useMemo(
    () => !loadingRole && role != null && CALENDAR_ROLES.includes(role),
    [loadingRole, role]
  );

  const showStaffTools = useMemo(
    () => !loadingRole && role != null && STAFF_ROLES.includes(role),
    [loadingRole, role]
  );

  return (
    <TabsProvider>
      <div className="min-h-screen bg-black text-white font-blackops">
        {/* Tabs bar only */}
        <div className="border-b border-neutral-800 bg-neutral-900">
          <div className="mx-auto max-w-7xl px-3 py-2">
            <TabsBar />
          </div>
        </div>

        <div className="flex">
          {/* Sidebar with utilities/settings only */}
          <aside className="hidden w-64 shrink-0 border-r border-neutral-800 bg-neutral-900 md:block">
            <div className="sticky top-0 h-[calc(100dvh-48px)] overflow-y-auto p-3">
              <DynamicRoleSidebar role={role ?? undefined} />

              {showCalendar && (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">Calendar</h3>
                  <Calendar
                    className="shadow-inner"
                    month={month}
                    onMonthChange={setMonth}
                    value={selectedDate ?? undefined}
                    onChange={setSelectedDate}
                  />
                </div>
              )}

              {showStaffTools && (
                <>
                  <div className="mt-4">
                    <ChatDock />
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setAssistantOpen(true)}
                      className="w-full rounded border border-white/15 px-3 py-2 text-sm hover:border-orange-500"
                    >
                      Tech Assistant
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 p-6">
            {loadingRole ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-lg border border-neutral-800 bg-neutral-900"
                  />
                ))}
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>

      {/* Assistant Drawer */}
      {assistantOpen && (
        <div className="fixed inset-0 z-50">
          <button
            className="absolute inset-0 bg-black/60"
            aria-label="Close assistant"
            onClick={() => setAssistantOpen(false)}
          />
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-3xl bg-neutral-900 text-white border-l border-neutral-800 p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-300">Tech Assistant</h2>
              <button
                onClick={() => setAssistantOpen(false)}
                className="rounded border border-white/15 px-2 py-1 text-xs hover:border-orange-500"
              >
                Close
              </button>
            </div>

            <TechAssistant
              defaultVehicle={currentVehicle ?? undefined}
              workOrderLineId={currentWorkOrderLineId ?? undefined}
            />
          </aside>
        </div>
      )}
    </TabsProvider>
  );
}