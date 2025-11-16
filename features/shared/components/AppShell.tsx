// app/(app)/AppShell.tsx  (or wherever your shell actually lives)
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";
import ShiftTracker from "@shared/components/ShiftTracker";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import AgentRequestModal from "@/features/agent/components/AgentRequestModal";

const NON_APP_ROUTES = [
  "/",
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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [punchOpen, setPunchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [incomingConvoId, setIncomingConvoId] = useState<string | null>(null);
  const punchRef = useRef<HTMLDivElement | null>(null);

  const isAppRoute = !NON_APP_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
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
          }
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

  // who can see the Agent Console button
  const canSeeAgentConsole =
    !!userRole &&
    ["owner", "manager", "admin", "advisor", "agent_admin"].includes(userRole);

  if (!isAppRoute) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen flex bg-background text-foreground">
        {/* Sidebar */}
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

        {/* Main */}
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

              {/* open our chat modal */}
              <ActionButton onClick={() => setChatOpen(true)} title="Messages">
                💬 <span className="hidden lg:inline">Messages</span>
              </ActionButton>

              {/* Agent Request – available to any signed-in user */}
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

              {/* Agent Console (role-gated) */}
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
              className="hidden md:block fixed right-6 top-16 z-50 w-72 rounded-lg border border-white/10 bg-surface/95 backdrop-blur p-3 shadow-lg"
            >
              <h2 className="text-sm font-medium mb-2 text-foreground/80">
                Shift Tracker
              </h2>
              <ShiftTracker userId={userId} />
            </div>
          ) : null}

          {/* content */}
          <main className="flex-1 px-3 md:px-6 pt-14 md:pt-6 pb-14 md:pb-6 max-w-6xl w-full mx-auto">
            {children}
          </main>

          {/* mobile nav */}
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
    </>
  );
}