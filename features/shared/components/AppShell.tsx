"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { Toaster } from "sonner";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ShiftTracker from "@shared/components/ShiftTracker";
import InboxModal from "@/features/chat/components/InboxModal";
import AgentRequestModal from "@/features/agent/components/AgentRequestModal";
import { cn } from "@/features/shared/utils/cn";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";
import ForcePasswordChangeModal from "@/features/auth/components/ForcePasswordChangeModal";
import AskAssistantEntry from "@/features/assistant/components/AskAssistantEntry";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";
import { isBillingAttentionStatus } from "@/features/stripe/lib/stripe/subscriptionStatus";

const NON_APP_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/coming-soon",
  "/auth",
  "/forgot-password",
  "/auth/reset",
  "/auth/set-password",
  "/mobile",
  "/demo",
];

const HEADER_OFFSET_DESKTOP = "pt-14";

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
    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors"
    style={{
      borderColor: "rgba(148,163,184,0.22)",
      background:
        "linear-gradient(145deg, rgba(2,6,23,0.82), color-mix(in srgb, var(--brand-secondary, #0F172A) 58%, rgba(0,0,0,0.92)))",
      color: "rgb(226,232,240)",
    }}
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
  | "stripe_subscription_status"
  | "stripe_trial_end"
  | "stripe_current_period_end"
>;

type AppShellInitialIdentity = {
  userId: string | null;
  email: string | null;
  shopId: string | null;
  role: string | null;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function AppShell({
  children,
  initialIdentity,
}: {
  children: React.ReactNode;
  initialIdentity?: AppShellInitialIdentity | null;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();
  const { data: activeBrand } = useActiveBrand();

  const [userId, setUserId] = useState<string | null>(
    initialIdentity?.userId ?? null,
  );
  const [userRole, setUserRole] = useState<string | null>(
    initialIdentity?.role ?? null,
  );
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [, setShopId] = useState<string | null>(
    initialIdentity?.shopId ?? null,
  );
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

  const isPortalRoute =
    pathname === "/portal" || pathname.startsWith("/portal/");
  const isAppRoute =
    !isPortalRoute &&
    !NON_APP_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const canSeeAgentConsole =
    !!userRole &&
    ["owner", "manager", "admin", "advisor", "agent_admin"].includes(userRole);
  const isMobileWorkOrderDetail = /^\/mobile\/work-orders\/[^/]+$/i.test(
    pathname,
  );

  const showBillingBadge = isBillingAttentionStatus(subStatus);

  const billingHref = "/dashboard/owner/settings#billing";

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
            const msg =
              raw as Database["public"]["Tables"]["messages"]["Row"] & {
                recipients?: string[] | null;
              };

            if (msg.sender_id === uid) return;
            if (Array.isArray(msg.recipients) && !msg.recipients.includes(uid))
              return;

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
            ? "font-semibold text-white"
            : "text-neutral-500 hover:text-neutral-100",
        )}
        style={active ? { color: "var(--brand-accent, #E39A6E)" } : undefined}
      >
        {label}
      </Link>
    );
  };

  if (!isAppRoute) {
    return (
      <div className="min-h-screen text-[var(--theme-text-primary,#E2E8F0)]">
        {children}
        <Toaster closeButton richColors position="top-right" theme="dark" />
      </div>
    );
  }

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
          className="mr-2 hidden items-center lg:flex"
        >
          <div
            className="rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm backdrop-blur transition"
            style={{
              borderColor: "rgba(255,255,255,0.10)",
              background:
                "linear-gradient(135deg, rgba(0,0,0,0.55), color-mix(in srgb, var(--brand-secondary, #0F172A) 48%, black))",
              color: "#e5e7eb",
            }}
          >
            <span style={{ color: "var(--brand-accent, #E39A6E)" }}>Trial</span>
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
        className="mr-2 hidden items-center lg:flex"
      >
        <div className="rounded-full border border-red-500/30 bg-red-950/30 px-3 py-1 text-[11px] font-semibold text-red-100 shadow-sm backdrop-blur transition hover:border-red-400/40">
          Billing issue:
          <span className="ml-1 uppercase tracking-[0.12em]">
            {statusLabel}
          </span>
          {dueLabel ? (
            <span className="ml-2 text-red-200/80">{dueLabel}</span>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <>
      <div
        className={cn(
          "flex min-h-screen overflow-x-hidden text-foreground transition-[filter,opacity] duration-200",
          chatOpen && "pointer-events-none opacity-70 blur-[1.5px] saturate-75",
        )}
      >
        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden border-r backdrop-blur-xl transition-all duration-300 md:flex md:flex-col",
            HEADER_OFFSET_DESKTOP,
            sidebarOpen
              ? "translate-x-0 border-r md:w-52 lg:w-56 xl:w-60"
              : "pointer-events-none -translate-x-full md:w-0",
          )}
          style={{
            borderColor: "var(--metal-border-soft, rgba(148,163,184,0.3))",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.96), color-mix(in srgb, var(--brand-secondary, #0F172A) 82%, black), rgba(0,0,0,0.96))",
          }}
        >
          <div
            className={cn(
              "flex h-full flex-col transition-opacity duration-200",
              sidebarOpen ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-3 xl:px-4">
              <Link
                href="/dashboard"
                className="flex min-w-0 items-center gap-3 transition-colors hover:opacity-95"
              >
                {activeBrand?.logoUrl ? (
                  <div className="flex h-9 max-w-[148px] items-center">
                    <Image
                      src={activeBrand.logoUrl}
                      alt="Shop logo"
                      width={148}
                      height={36}
                      className="max-h-9 w-auto object-contain"
                      unoptimized
                    />
                  </div>
                ) : (
                  <span
                    className="truncate text-lg font-semibold tracking-tight"
                    style={{
                      fontFamily:
                        "Black Ops One, var(--font-blackops), system-ui",
                      color: "var(--brand-primary, #C1663B)",
                    }}
                  >
                    ProFixIQ
                  </span>
                )}
              </Link>
            </div>

            <RoleSidebar
              initialRole={initialIdentity?.role ?? null}
              initialEmail={initialIdentity?.email ?? null}
            />

            <div className="mt-auto h-12 border-t border-white/10" />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header
            className="fixed inset-x-0 top-0 z-30 hidden h-12 items-center justify-between border-b px-3 backdrop-blur-xl md:flex lg:px-4"
            style={{
              borderColor:
                "color-mix(in srgb, var(--brand-primary, #C1663B) 30%, var(--metal-border-soft, rgba(148,163,184,0.3)))",
              background:
                "linear-gradient(to right, rgba(0,0,0,0.95), color-mix(in srgb, var(--brand-secondary, #0F172A) 82%, black), rgba(0,0,0,0.95))",
              boxShadow:
                "0 18px 40px rgba(0,0,0,0.95), 0 0 26px color-mix(in srgb, var(--brand-primary, #C1663B) 18%, transparent)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/60 text-neutral-300 shadow-sm transition hover:text-white"
              >
                <span className="sr-only">Toggle navigation</span>
                <div className="space-y-0.5">
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                </div>
              </button>

              <nav className="flex gap-3 text-sm text-neutral-400">
                <Link href="/dashboard" className="hover:text-neutral-100">
                  Dashboard
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-1.5 lg:gap-2">
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

              <ActionButton onClick={() => setChatOpen(true)} title="Inbox">
                <span>Inbox</span>
              </ActionButton>

              {userId ? (
                <ActionButton
                  onClick={() => setAgentDialogOpen(true)}
                  title="Submit a request to ProFixIQ Agent"
                >
                  <span>Agent Request</span>
                </ActionButton>
              ) : null}

              <AskAssistantEntry placement="header" />

              {userId && canSeeAgentConsole ? (
                <ActionButton
                  onClick={() => router.push("/agent")}
                  title="ProFixIQ Agent Console"
                >
                  <span>Agent Console</span>
                </ActionButton>
              ) : null}

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

          {punchOpen && userId ? (
            <div
              ref={punchRef}
              className="fixed right-6 top-20 z-30 hidden w-72 rounded-xl border p-3 backdrop-blur-xl md:block"
              style={{
                borderColor: "var(--metal-border-soft, rgba(148,163,184,0.3))",
                background:
                  "linear-gradient(135deg, rgba(0,0,0,0.92), color-mix(in srgb, var(--brand-secondary, #0F172A) 74%, black))",
                boxShadow: "0 18px 40px rgba(0,0,0,0.95)",
              }}
            >
              <h2 className="mb-2 text-sm font-medium text-neutral-100">
                Shift Tracker
              </h2>
              <ShiftTracker userId={userId} />
            </div>
          ) : null}

          <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-14 pt-16 md:px-4 md:pb-6 md:pt-16 lg:px-6 lg:pt-[4.25rem] xl:px-8 2xl:px-10">
            <TabsBridge tabsSubdued={chatOpen}>
              <div className="relative z-0 min-w-0">{children}</div>
            </TabsBridge>
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            style={{
              borderColor: "var(--metal-border-soft, rgba(148,163,184,0.3))",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.95), color-mix(in srgb, var(--brand-secondary, #0F172A) 78%, black))",
            }}
          >
            <div className="flex px-1">
              <NavItem href="/dashboard" label="Dashboard" />
              <NavItem href="/work-orders" label="Work Orders" />
              <NavItem href="/inspections" label="Inspections" />
              <NavItem href="/chat" label="Inbox" />
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

      <InboxModal
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          setIncomingConvoId(null);
        }}
        seedConversationId={incomingConvoId}
      />

      {userId ? (
        <AgentRequestModal
          open={agentDialogOpen}
          onOpenChange={setAgentDialogOpen}
        />
      ) : null}

      <Toaster closeButton richColors position="top-right" theme="dark" />
      {!isMobileWorkOrderDetail ? (
        <div className="md:hidden">
          <AskAssistantEntry mobile />
        </div>
      ) : null}
    </>
  );
}
