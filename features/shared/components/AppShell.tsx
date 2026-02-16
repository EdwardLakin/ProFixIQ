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
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";
import ForcePasswordChangeModal from "@/features/auth/components/ForcePasswordChangeModal";

const NON_APP_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/coming-soon",
  "/auth",
  "/mobile",
  // ✅ Demo funnel is marketing/public, not wrapped in dashboard
  "/demo",
];

const HEADER_OFFSET_DESKTOP = "pt-14"; // keeps sidebar content below fixed desktop header

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

type ProfileScope = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "role" | "must_change_password" | "shop_id"
>;

type ShopBillingScope = Pick<
  Database["public"]["Tables"]["shops"]["Row"],
  "stripe_subscription_status" | "stripe_trial_end" | "stripe_current_period_end"
>;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Billing/trial badge state
  const [, setShopId] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [trialEndIso, setTrialEndIso] = useState<string | null>(null);
  const [periodEndIso, setPeriodEndIso] = useState<string | null>(null);

  const trialDaysLeft = daysUntil(trialEndIso);
  const periodDaysLeft = daysUntil(periodEndIso);

  const [punchOpen, setPunchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [incomingConvoId, setIncomingConvoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const punchRef = useRef<HTMLDivElement | null>(null);

  const isPortalRoute = pathname === "/portal" || pathname.startsWith("/portal/");

  const isAppRoute =
    !isPortalRoute &&
    !NON_APP_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // ✅ Only hide Planner / AI Planner for tech role (everyone else keeps them)
  const isTech = (userRole ?? "").toLowerCase() === "tech";

  const canSeeAgentConsole =
    !!userRole &&
    ["owner", "manager", "admin", "advisor", "agent_admin"].includes(userRole);

  // show badge when trialing OR when billing is in a bad state
  const showBillingBadge =
    (subStatus ?? "") === "trialing" ||
    (subStatus ?? "") === "past_due" ||
    (subStatus ?? "") === "incomplete" ||
    (subStatus ?? "") === "unpaid";

  // click target for badge -> owner settings billing section
  const billingHref = "/dashboard/owner/settings#billing";

  // load session user once, load role, billing & subscribe to messages (main app only)
  useEffect(() => {
    if (!isAppRoute) return;

    let cleanup: (() => void) | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (!uid) return;

      // load user role + must_change_password + shop_id
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, must_change_password, shop_id")
          .eq("id", uid)
          .single<ProfileScope>();

        if (profile?.role) setUserRole(profile.role as string);
        setMustChangePassword(!!profile?.must_change_password);

        const sid = (profile?.shop_id as string | null) ?? null;
        setShopId(sid);

        // load billing badge info from shop
        if (sid) {
          const { data: shop } = await supabase
            .from("shops")
            .select(
              "stripe_subscription_status, stripe_trial_end, stripe_current_period_end",
            )
            .eq("id", sid)
            .maybeSingle<ShopBillingScope>();

          setSubStatus(
            (shop?.stripe_subscription_status as string | null) ?? null,
          );
          setTrialEndIso((shop?.stripe_trial_end as string | null) ?? null);
          setPeriodEndIso(
            (shop?.stripe_current_period_end as string | null) ?? null,
          );
        } else {
          setSubStatus(null);
          setTrialEndIso(null);
          setPeriodEndIso(null);
        }
      } catch (err) {
        console.error("Failed to load profile/shop for AppShell", err);
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
            const raw = payload.new as unknown;
            const msg = raw as Database["public"]["Tables"]["messages"]["Row"] & {
              recipients?: string[] | null;
            };

            // ignore messages I sent
            if (msg.sender_id === uid) return;

            // if a recipients array exists, make sure i'm in it
            if (Array.isArray(msg.recipients)) {
              if (!msg.recipients.includes(uid)) return;
            }

            // ok, this is for me – open modal on top
            setIncomingConvoId(msg.conversation_id);
            setChatOpen(true);
          },
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })();

    return () => cleanup?.();
  }, [supabase, isAppRoute]);

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

  // ✅ PUBLIC / NON-APP ROUTES:
  // Landing, demo funnel, portal, etc. — no dashboard shell, no TabsBridge.
  if (!isAppRoute) {
    return (
      <div className="min-h-screen bg-neutral-950 text-foreground">
        {children}
        <Toaster closeButton richColors position="top-right" theme="dark" />
      </div>
    );
  }

  // Badge UI (desktop)
  const BillingBadge = () => {
    if (!showBillingBadge) return null;

    const goToBilling = () => {
      router.push(billingHref);
    };

    if ((subStatus ?? "") === "trialing") {
      const label =
        typeof trialDaysLeft === "number"
          ? trialDaysLeft <= 0
            ? "Ends today"
            : `${trialDaysLeft} days left`
          : "Active";

      return (
        <button
          type="button"
          onClick={goToBilling}
          title="Open billing details"
          className="mr-2 hidden lg:flex items-center"
        >
          <div className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] font-semibold text-neutral-200 shadow-sm backdrop-blur transition hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/70">
            <span className="text-[color:var(--accent-copper-light)]">Trial</span>
            <span className="ml-2 text-neutral-300">{label}</span>
          </div>
        </button>
      );
    }

    const statusLabel = String(subStatus ?? "unknown").toUpperCase();
    const dueLabel =
      typeof periodDaysLeft === "number"
        ? periodDaysLeft <= 0
          ? "Due now"
          : `${periodDaysLeft} days`
        : "";

    return (
      <button
        type="button"
        onClick={goToBilling}
        title="Open billing details"
        className="mr-2 hidden lg:flex items-center"
      >
        <div className="rounded-full border border-red-500/30 bg-red-950/30 px-3 py-1 text-[11px] font-semibold text-red-100 shadow-sm backdrop-blur transition hover:border-red-400/40">
          Billing issue:{" "}
          <span className="ml-1 uppercase tracking-[0.12em]">{statusLabel}</span>
          {dueLabel ? (
            <span className="ml-2 text-red-200/80">{dueLabel}</span>
          ) : null}
        </div>
      </button>
    );
  };

  // ✅ MAIN APP SHELL (dashboard + tabs)
  return (
    <>
      {/* Root: prevent horizontal growth; main fix is min-w-0 + sidebar shrink-0 */}
      <div className="flex min-h-screen bg-neutral-950 text-foreground overflow-x-hidden">
        {/* Sidebar (CRITICAL: shrink-0 so it never collapses when tabs grow) */}
        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden md:flex md:flex-col border-r border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-b from-black/95 via-neutral-950 to-black/95 backdrop-blur-xl transition-all duration-300",
            HEADER_OFFSET_DESKTOP,
            sidebarOpen
              ? "md:w-64 translate-x-0"
              : "md:w-0 -translate-x-full pointer-events-none",
          )}
        >
          {/* Sidebar contents */}
          <div
            className={cn(
              "flex h-full flex-col transition-opacity duration-200",
              sidebarOpen ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <Link
                href="/dashboard"
                className="text-lg font-semibold tracking-tight transition-colors hover:opacity-95"
                style={{
                  fontFamily: "Black Ops One, var(--font-blackops), system-ui",
                  color: "#c1663b",
                }}
              >
                ProFixIQ
              </Link>
            </div>

            <RoleSidebar />

            <div className="mt-auto h-12 border-t border-white/10" />
          </div>
        </aside>

        {/* Main column (CRITICAL: min-w-0 so content can shrink + not push sidebar off) */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="fixed inset-x-0 top-0 z-40 hidden h-14 items-center justify-between border-b border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/95 via-neutral-950/95 to-black/95 px-4 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl md:flex">
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
              </nav>
            </div>

            <div className="flex items-center gap-2">
              <BillingBadge />

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

              {/* ✅ Hide Planner + AI Planner ONLY for tech */}
              {!isTech && (
                <ActionButton
                  onClick={() => router.push("/dashboard/appointments")}
                  title="Planner / appointments"
                >
                  📅 <span className="hidden lg:inline">Planner</span>
                </ActionButton>
              )}

              {!isTech && (
                <ActionButton
                  onClick={() => router.push("/agent/planner")}
                  title="AI Planner"
                >
                  ⚡ <span className="hidden lg:inline">AI Planner</span>
                </ActionButton>
              )}

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

          {/* content (CRITICAL: min-w-0 + overflow-x-hidden prevents tab row from widening layout) */}
          <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden bg-neutral-950 px-3 pb-14 pt-16 md:px-6 md:pb-6 md:pt-20 lg:px-10 xl:px-16">
            <TabsBridge>
              <div className="relative z-0 min-w-0">{children}</div>
            </TabsBridge>
          </main>

          {/* mobile nav */}
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--metal-border-soft,#1f2937)] bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            <div className="flex px-1">
              <NavItem href="/dashboard" label="Dashboard" />
              <NavItem href="/work-orders" label="Work Orders" />
              <NavItem href="/inspections" label="Inspections" />
              <NavItem href="/chat" label="Messages" />
              <NavItem href="/mobile/appointments" label="Schedule" />

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

      <ForcePasswordChangeModal
        open={!!userId && mustChangePassword}
        onDone={() => {
          setMustChangePassword(false);
          router.refresh();
        }}
      />

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

      {userId && (
        <AgentRequestModal
          open={agentDialogOpen}
          onOpenChange={setAgentDialogOpen}
        />
      )}

      <Toaster closeButton richColors position="top-right" theme="dark" />
    </>
  );
}