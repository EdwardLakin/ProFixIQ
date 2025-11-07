"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import DynamicRoleSidebar from "@shared/components/DynamicRoleSidebar";
import Calendar from "@shared/components/ui/Calendar";
import { TabsProvider } from "@shared/components/tabs/TabsProvider";

// Lazy-load the assistant to reduce initial bundle & avoid SSR issues
const TechAssistant = dynamic(
  () => import("@/features/shared/components/TechAssistant"),
  { ssr: false },
);

// -------------------- Roles (staff only) --------------------
type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";

const CALENDAR_ROLES: Role[] = ["owner", "admin", "manager", "advisor"];

function normalizeRole(raw: string | null | undefined): Role | null {
  if (!raw) return null;
  if (
    raw === "owner" ||
    raw === "admin" ||
    raw === "manager" ||
    raw === "advisor" ||
    raw === "mechanic" ||
    raw === "parts"
  ) {
    return raw;
  }
  return null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const router = useRouter();
  const supabase = createClientComponentClient();

  // ---- Role state ----
  const [role, setRole] = useState<Role | null>(null);
  const [loadingRole, setLoadingRole] = useState<boolean>(true);

  // ---- Calendar state ----
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // ---- UI state ----
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [assistantOpen, setAssistantOpen] = useState<boolean>(false);

  // ---- Assistant context (seed vehicle + WO line) ----
  const [currentVehicle, setCurrentVehicle] = useState<{
    year?: string;
    make?: string;
    model?: string;
  } | null>(null);
  const [currentWorkOrderLineId, setCurrentWorkOrderLineId] =
    useState<string | null>(null);

  // Fetch user role once
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

        if (!cancelled) {
          setRole(normalizeRole(profile?.role ?? null));
        }
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

  // Demo context seed
  useEffect(() => {
    setCurrentVehicle({ year: "2016", make: "Ford", model: "F-150" });
    setCurrentWorkOrderLineId(null);
  }, []);

  // Close assistant when someone in the app dispatches our custom event
  useEffect(() => {
    const openAssistant: EventListener = () => setAssistantOpen(true);
    window.addEventListener("open-tech-assistant", openAssistant);
    return () => window.removeEventListener("open-tech-assistant", openAssistant);
  }, []);

  // Visibility gates
  const showCalendar = useMemo(
    () => !loadingRole && role !== null && CALENDAR_ROLES.includes(role),
    [loadingRole, role],
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  };

  return (
    <TabsProvider>
      <div className="min-h-screen bg-black text-white font-blackops">
        {/* layout shell */}
        <div className="flex">
          {/* Desktop sidebar */}
          <aside className="hidden w-64 shrink-0 border-r border-neutral-800 bg-neutral-900 md:block">
            <div className="sticky top-0 h-[calc(100dvh-0px)] overflow-y-auto p-3">
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

          {/* Main content column */}
          <div className="flex-1 flex flex-col">
            {/* top bar inside dashboard */}
            <div className="flex items-center justify-between border-b border-neutral-900 bg-black/60 px-6 py-3">
              <div className="flex items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded border border-white/15 px-2 py-1 text-xs"
                >
                  Menu
                </button>
              </div>
              <div className="flex-1" />
              <button
                onClick={handleSignOut}
                className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200 hover:bg-orange-500/20"
              >
                Sign out
              </button>
            </div>

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
      </div>

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

      {/* Tech Assistant Drawer */}
      {assistantOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
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
              <h2 className="text-sm font-semibold text-neutral-300">
                Tech Assistant
              </h2>
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