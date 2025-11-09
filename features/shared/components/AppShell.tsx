// features/shared/components/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";
import ShiftTracker from "@shared/components/ShiftTracker";

// tiny action button
const ActionButton = ({
  onClick,
  children,
  title,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-surface/70 px-2.5 py-1.5 text-xs text-foreground hover:border-accent hover:text-white transition"
  >
    {children}
  </button>
);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [userId, setUserId] = useState<string | null>(null);
  const [punchOpen, setPunchOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? null);
    })();
  }, [supabase]);

  // ✅ routes where we DON'T want the app chrome
  const isPublic = useMemo(() => {
    // add any other marketing/auth pages here
    return (
      pathname === "/" ||
      pathname.startsWith("/landing") ||
      pathname.startsWith("/subscribe") ||
      pathname.startsWith("/sign-in") ||
      pathname.startsWith("/sign-up")
    );
  }, [pathname]);

  // ✅ if public: just render the page, nothing else
  if (isPublic) {
    return <>{children}</>;
  }

  const NavItem = ({ href, label }: { href: string; label: string }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={[
          "flex-1 text-center py-2 text-xs font-medium transition-colors",
          active
            ? "text-accent font-semibold"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ---------- Desktop Sidebar ---------- */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-white/5 bg-surface/80 backdrop-blur">
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
          <Link
            href="/dashboard"
            className="text-base font-semibold tracking-tight text-foreground hover:text-accent transition"
          >
            ProFixIQ
          </Link>
          <ThemeToggleButton />
        </div>

        <RoleSidebar />

        <div className="mt-auto h-10 border-t border-white/5" />
      </aside>

      {/* ---------- Main Column ---------- */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-white/5 bg-background/60 backdrop-blur z-40">
          <nav className="flex gap-5 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/work-orders" className="hover:text-foreground">
              Work Orders
            </Link>
            <Link href="/inspections" className="hover:text-foreground">
              Inspections
            </Link>
            <Link href="/parts" className="hover:text-foreground">
              Parts
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {userId ? (
              <ActionButton
                onClick={() => setPunchOpen((p) => !p)}
                title="Punch / shift tracker"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Shift
              </ActionButton>
            ) : null}

            <ActionButton onClick={() => router.push("/chat")} title="Messages">
              💬 <span className="hidden lg:inline">Messages</span>
            </ActionButton>

            <ActionButton
              onClick={() => router.push("/portal/appointments")}
              title="Planner / appointments"
            >
              📅 <span className="hidden lg:inline">Planner</span>
            </ActionButton>

            <ActionButton
              onClick={() => router.push("/ai/assistant")}
              title="AI Assistant"
            >
              ⚡ <span className="hidden lg:inline">AI</span>
            </ActionButton>
          </div>
        </header>

        {/* floating shift panel */}
        {punchOpen && userId ? (
          <div className="hidden md:block fixed right-6 top-16 z-50 w-72 rounded-lg border border-white/10 bg-surface/95 backdrop-blur p-3 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-foreground/90">
                Shift Tracker
              </h2>
              <button
                onClick={() => setPunchOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <ShiftTracker userId={userId} />
          </div>
        ) : null}

        {/* Page content */}
        <main className="flex-1 px-3 md:px-6 pt-14 md:pt-6 pb-14 md:pb-6 max-w-6xl w-full mx-auto">
          {children}
        </main>

        {/* ---------- Mobile bottom nav ---------- */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
          <div className="flex px-1">
            <NavItem href="/dashboard" label="Dashboard" />
            <NavItem href="/work-orders" label="Work Orders" />
            <NavItem href="/inspections" label="Inspections" />
            <NavItem href="/chat" label="Messages" />
          </div>
        </nav>
      </div>
    </div>
  );
}