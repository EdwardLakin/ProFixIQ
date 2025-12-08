// features/shared/components/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { Toaster } from "sonner";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ShiftTracker from "@shared/components/ShiftTracker";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import AgentRequestModal from "@/features/agent/components/AgentRequestModal";
import { cn } from "@/features/shared/utils/cn";

const NON_APP_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/coming-soon",
  "/auth",
  "/mobile",
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
    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-neutral-100 shadow-sm backdrop-blur-md transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:text-white hover:bg-black/80"
  >
    {children}
  </button>
);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [punchOpen, setPunchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [incomingConvoId, setIncomingConvoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const punchRef = useRef<HTMLDivElement | null>(null);

  const isAppRoute = !NON_APP_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // load session user once, load role, & subscribe to messages
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (!uid) return;

      // load user role for agent console gating
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single();

        if (profile?.role) {
          setUserRole(profile.role as string);
        }
      } catch (err) {
        console.error("Failed to load profile role for AppShell", err);
      }

      // realtime for incoming messages
      const channel = supabase
        .channel("app-shell-messages")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
          },
          (payload) => {
            const msg =
              payload.new as Database["public"]["Tables"]["messages"]["Row"] &
                Partial<{ recipients: string[] }>;

            // ignore messages I sent
            if (msg.sender_id === uid) return;

            // if a recipients array exists, make sure i'm in it
            if (Array.isArray((msg as any).recipients)) {
              const recips = (msg as any).recipients as string[];
              if (!recips.includes(uid)) {
                return;
              }
            }

            // ok, this is for me – open modal on top
            setIncomingConvoId(msg.conversation_id);
            setChatOpen(true);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    })();
  }, [supabase]);

  // click-away for shift tracker
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
        className={cn(
          "flex-1 py-2 text-center text-xs font-medium transition-colors",
          active
            ? "text-[color:var(--accent-copper,#f97316)] font-semibold"
            : "text-neutral-500 hover:text-neutral-100",
        )}
      >
        {label}
      </Link>
    );
  };

  // who can see the Agent Console button
  const canSeeAgentConsole =
    !!userRole &&
    ["owner", "manager", "admin", "advisor", "agent_admin"].includes(userRole);

  if (!isAppRoute) {
    return (
      <div className="min-h-screen bg-black text-foreground">
        {children}
        <Toaster
          closeButton
          richColors
          position="top-right"
          theme="dark"
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-screen text-foreground">
        {/* Sidebar – collapsible on desktop */}
        <aside
          className={cn(
            "hidden md:flex md:flex-col border-r border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-b from-black/90 via-slate-950/95 to-black/90 backdrop-blur-xl transition-all duration-300",
            sidebarOpen
              ? "md:w-64 translate-x-0"
              : "md:w-0 -translate-x-full pointer-events-none",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight text-neutral-100 hover:text-[color:var(--accent-copper,#f97316)] transition-colors"
              style={{
                fontFamily: "Black Ops One, var(--font-blackops), system-ui",
              }}
            >
              ProFixIQ
            </Link>
          </div>

          <RoleSidebar />

          <div className="mt-auto h-12 border-t border-white/10" />
        </aside>

        {/* Main */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Top bar */}
          <header className="fixed inset-x-0 top-0 z-40 hidden h-14 items-center justify-between border-b border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/90 via-slate-950/90 to-black/90 px-4 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:flex">
            <div className="flex items-center gap-3">
              {/* Sidebar toggle */}
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/60 text-neutral-300 shadow-sm transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:text-white hover:bg-black/80"
              >
                <span className="sr-only">Toggle navigation</span>
                <div className="space-y-0.5">
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                </div>
              </button>

              <nav className="flex gap-4 text-sm text-neutral-400">
                <Link href="/dashboard" className="hover:text-neutral-100">
                  Dashboard
                </Link>
                <Link href="/work-orders" className="hover:text-neutral-100">
                  Work Orders
                </Link>
                <Link href="/inspections" className="hover:text-neutral-100">
                  Inspections
                </Link>
                <Link href="/parts" className="hover:text-neutral-100">
                  Parts
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-2">
              {userId ? (
                <ActionButton
                  onClick={() => setPunchOpen((p) => !p)}
                  title="Punch / shift tracker"
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                  Shift
                </ActionButton>
              ) : null}

              <ActionButton onClick={() => setChatOpen(true)} title="Messages">
                💬 <span className="hidden lg:inline">Messages</span>
              </ActionButton>

              {userId && (
                <ActionButton
                  onClick={() => setAgentDialogOpen(true)}
                  title="Submit a request to ProFixIQ Agent"
                >
                  🤖 <span className="hidden lg:inline">Agent Request</span>
                </ActionButton>
              )}

              <ActionButton
                onClick={() => router.push("/portal/appointments")}
                title="Planner / appointments"
              >
                📅 <span className="hidden lg:inline">Planner</span>
              </ActionButton>

              <ActionButton
                onClick={() => router.push("/agent/planner")}
                title="AI Planner"
              >
                ⚡ <span className="hidden lg:inline">AI Planner</span>
              </ActionButton>

              {userId && canSeeAgentConsole && (
                <ActionButton
                  onClick={() => router.push("/agent")}
                  title="ProFixIQ Agent Console"
                >
                  🧠 <span className="hidden lg:inline">Agent</span>
                </ActionButton>
              )}

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

          {/* floating shift panel */}
          {punchOpen && userId ? (
            <div
              ref={punchRef}
              className="fixed right-6 top-20 z-50 hidden w-72 rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/90 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:block"
            >
              <h2 className="mb-2 text-sm font-medium text-neutral-100">
                Shift Tracker
              </h2>
              <ShiftTracker userId={userId} />
            </div>
          ) : null}

          {/* content */}
          <main className="flex w-full flex-1 flex-col px-3 pb-14 pt-16 md:px-6 md:pb-6 md:pt-20 lg:px-10 xl:px-16">
            {children}
          </main>

          {/* mobile nav */}
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--metal-border-soft,#1f2937)] bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            <div className="flex px-1">
              <NavItem href="/dashboard" label="Dashboard" />
              <NavItem href="/work-orders" label="Work Orders" />
              <NavItem href="/inspections" label="Inspections" />
              <NavItem href="/chat" label="Messages" />
              <NavItem href="/mobile/planner" label="Planner" />

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/sign-in");
                }}
                className="flex-1 py-2 text-center text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-100"
              >
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Global chat modal */}
      <NewChatModal
        isOpen={chatOpen}
        onClose={() => {
          setChatOpen(false);
          setIncomingConvoId(null);
        }}
        created_by={userId ?? undefined}
        context_type={null}
        context_id={null}
        activeConversationId={incomingConvoId}
      />

      {/* Global Agent Request modal */}
      {userId && (
        <AgentRequestModal
          open={agentDialogOpen}
          onOpenChange={setAgentDialogOpen}
        />
      )}

      {/* Global toaster for the entire app shell */}
      <Toaster closeButton richColors position="top-right" theme="dark" />
    </>
  );
}