"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";
import ShiftTracker from "@shared/components/ShiftTracker";

const NON_APP_ROUTES = [
  "/",             // landing
  "/sign-in",
  "/sign-up",
  "/coming-soon",
  "/auth",
];

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
  const punchRef = useRef<HTMLDivElement | null>(null);

  // figure out if we should even render the app chrome
  const isAppRoute = !NON_APP_ROUTES.some((p) =>
    pathname === p || pathname.startsWith(p + "/"),
  );

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? null);
    })();
  }, [supabase]);

  // close shift tracker when clicking outside
  useEffect(() => {
    if (!punchOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!punchRef.current) return;
      if (!punchRef.current.contains(e.target as Node)) {
        setPunchOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [punchOpen]);

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

  // ---------------------------------------------------------------------------
  // Landing / auth pages → just render children, no sidebar / topbar
  // ---------------------------------------------------------------------------
  if (!isAppRoute) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* you CAN keep a tiny top bar here if you want */}
        {children}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // App pages layout
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ---------- Desktop Sidebar ---------- */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-white/5 bg-surface/80 backdrop-blur">
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
          <Link
            href="/dashboard"
            className="text-lg font-semibold tracking-tight text-foreground hover:text-accent transition"
          >
            ProFixIQ
          </Link>
          <ThemeToggleButton />
        </div>

        <RoleSidebar />

        <div className="mt-auto h-12 border-t border-white/5" />
      </aside>

      {/* ---------- Main Column ---------- */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-white/5 bg-background/60 backdrop-blur z-40">
          <nav className="flex gap-6 text-sm text-muted-foreground">
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

            {/* sign out here if you want it always visible */}
            <ActionButton
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/sign-in");
              }}
              title="Sign out"
            >
              Sign out
            </ActionButton>
          </div>
        </header>

        {/* floating shift panel (click-away enabled) */}
        {punchOpen && userId ? (
          <div
            ref={punchRef}
            className="hidden md:block fixed right-6 top-16 z-50 w-72 rounded-lg border border-white/10 bg-surface/95 backdrop-blur p-3 shadow-lg"
          >
            <h2 className="text-sm font-medium mb-2 text-foreground/80">
              Shift Tracker
            </h2>
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