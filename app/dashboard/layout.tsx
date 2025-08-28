// app/dashboard/layout.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import DynamicRoleSidebar from "@shared/components/DynamicRoleSidebar";
import Calendar from "@shared/components/ui/Calendar";
import { TabsProvider } from "@shared/context/TabsProvider";
import ShareBookingLink from "@dashboard/components/ShareBookingLink";

// roles that can see the calendar and share link
const CALENDAR_ROLES = ["owner", "admin", "manager", "advisor"];
const STAFF_ROLES = ["owner", "admin", "manager", "advisor", "parts"];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClientComponentClient();

  // role state
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  // calendar state
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          .single();

        if (!cancelled) setRole(profile?.role ?? null);
      } catch {
        if (!cancelled) setRole(null);
      } finally {
        if (!cancelled) setLoadingRole(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // close drawer on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    if (sidebarOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const showCalendar = useMemo(
    () => !loadingRole && !!role && CALENDAR_ROLES.includes(role),
    [loadingRole, role],
  );

  const showShareLink = useMemo(
    () => !loadingRole && !!role && STAFF_ROLES.includes(role),
    [loadingRole, role],
  );

  return (
    <TabsProvider>
      <div className="min-h-screen bg-black text-white font-blackops">

        {/* Header */}
        <div className="mx-auto flex max-w-7xl items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Toggle sidebar"
              className="inline-flex items-center justify-center rounded border border-white/15 px-3 py-1 text-sm hover:border-orange-500 md:hidden"
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              Menu
            </button>
            <h1 className="text-lg text-orange-400">
              {loadingRole ? "Loading…" : "Dashboard"}
            </h1>
          </div>
          {showShareLink && <ShareBookingLink />}
        </div>

        <div className="flex">
          {/* Desktop sidebar */}
          <aside className="hidden w-64 shrink-0 border-r border-neutral-800 bg-neutral-900 md:block">
            <div className="sticky top-0 h-[calc(100dvh-64px)] overflow-y-auto p-3">
              <DynamicRoleSidebar role={role ?? undefined} />

              {showCalendar && (
                <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-300">
                    Calendar
                  </h3>
                  <Calendar
                    className="shadow-inner"
                    month={month}
                    onMonthChange={setMonth}
                    value={selectedDate ?? undefined}
                    onChange={setSelectedDate}
                  />
                </div>
              )}
            </div>
          </aside>

          {/* Mobile drawer */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              {/* backdrop */}
              <button
                type="button"
                aria-label="Close sidebar"
                className="absolute inset-0 bg-black/60"
                onClick={() => setSidebarOpen(false)}
              />
              <aside
                className="relative z-50 h-full w-72 border-r border-neutral-800 bg-neutral-900 p-3"
                role="dialog"
                aria-modal="true"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-neutral-300">Navigation</span>
                  <button
                    type="button"
                    className="rounded border border-white/15 px-2 py-1 text-xs hover:border-orange-500"
                    onClick={() => setSidebarOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="h-[calc(100dvh-96px)] overflow-y-auto pr-1">
                  <DynamicRoleSidebar role={role ?? undefined} />

                  {showCalendar && (
                    <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <h3 className="mb-2 text-sm font-semibold text-neutral-300">
                        Calendar
                      </h3>
                      <Calendar
                        className="shadow-inner"
                        month={month}
                        onMonthChange={setMonth}
                        value={selectedDate ?? undefined}
                        onChange={setSelectedDate}
                      />
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}

          {/* Main content */}
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
    </TabsProvider>
  );
}