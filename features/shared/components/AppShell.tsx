// features/shared/components/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";
import ShiftTracker from "@shared/components/ShiftTracker";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [userId, setUserId] = useState<string | null>(null);
  const [punchOpen, setPunchOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? null);
    })();
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  const MobileNavItem = ({ href, label }: { href: string; label: string }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={[
          "flex-1 text-center py-2 text-xs font-medium transition-colors",
          active ? "text-accent font-semibold" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ---------- Sidebar ---------- */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-white/5 bg-surface/80 backdrop-blur">
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground hover:text-accent transition"
          >
            ProFixIQ
          </Link>
          <ThemeToggleButton />
        </div>

        <RoleSidebar />

        <div className="mt-auto h-10 border-t border-white/5" />
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Utility header */}
        <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-white/5 bg-background/70 backdrop-blur">
          <div className="text-sm text-muted-foreground capitalize">
            {pathname === "/" ? "Home" : pathname.replace("/", "").split("?")[0].replace(/-/g, " ")}
          </div>

          <div className="flex items-center gap-2">
            {userId ? (
              <button
                onClick={() => setPunchOpen((p) => !p)}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface/70 px-2.5 py-1.5 text-xs text-foreground hover:border-accent hover:text-white transition"
                title="Punch / shift tracker"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Shift
              </button>
            ) : null}

            <button
              onClick={() => router.push("/chat")}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface/70 px-2.5 py-1.5 text-xs text-foreground hover:border-accent hover:text-white transition"
            >
              💬 <span className="hidden lg:inline">Messages</span>
            </button>

            <button
              onClick={() => router.push("/portal/appointments")}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface/70 px-2.5 py-1.5 text-xs text-foreground hover:border-accent hover:text-white transition"
            >
              📅 <span className="hidden lg:inline">Planner</span>
            </button>

            <button
              onClick={() => router.push("/ai/assistant")}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface/70 px-2.5 py-1.5 text-xs text-foreground hover:border-accent hover:text-white transition"
            >
              ⚡ <span className="hidden lg:inline">AI</span>
            </button>

            {/* Sign out */}
            {userId ? (
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-md border border-red-400/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-100 hover:border-red-300 hover:bg-red-500/20 transition"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        {/* floating shift panel */}
        {punchOpen && userId ? (
          <div className="hidden md:block absolute right-6 top-16 z-50 w-72 rounded-lg border border-white/10 bg-surface/95 backdrop-blur p-3 shadow-lg">
            <h2 className="text-sm font-medium mb-2 text-foreground/80">Shift Tracker</h2>
            <ShiftTracker userId={userId} />

            <div className="mt-3 pt-3 border-t border-white/5">
              <button
                onClick={handleSignOut}
                className="w-full rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-100 hover:border-red-300 hover:bg-red-500/20 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : null}

        {/* page content */}
        <main className="flex-1 px-3 md:px-6 pt-14 md:pt-6 pb-14 md:pb-6 max-w-6xl w-full mx-auto">
          {children}
        </main>

        {/* mobile bottom bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
          <div className="flex px-1">
            <MobileNavItem href="/dashboard" label="Dashboard" />
            <MobileNavItem href="/work-orders" label="Work Orders" />
            <MobileNavItem href="/inspections" label="Inspections" />
            <MobileNavItem href="/chat" label="Messages" />
          </div>
        </nav>
      </div>
    </div>
  );
}