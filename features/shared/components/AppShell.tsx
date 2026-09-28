"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ShiftTracker from "@shared/components/ShiftTracker";
import {
  fetchMobileShiftState,
  type MobileShiftState,
} from "@/features/mobile/shifts/client";
import InboxModal from "@/features/chat/components/InboxModal";
import AgentRequestModal from "@/features/agent/components/AgentRequestModal";
import { cn } from "@/features/shared/utils/cn";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";
import ForcePasswordChangeModal from "@/features/auth/components/ForcePasswordChangeModal";
import AskAssistantEntry from "@/features/assistant/components/AskAssistantEntry";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";
import { isBillingAttentionStatus } from "@/features/stripe/lib/stripe/subscriptionStatus";
import { isOutsideDesktopAppShell } from "@/features/shared/lib/routes/shellBoundaries";
import OpsNotificationsBell from "@/features/shared/components/OpsNotificationsBell";
import NotificationPreferencesButton from "@/features/shared/components/NotificationPreferencesButton";
import { useNotificationPreferences } from "@/features/shared/hooks/useNotificationPreferences";
import { claimNotificationPopup, isNewAssistantAction } from "@/features/shared/lib/claimNotificationPopup";
import { isDefaultOpsOperatorEmail } from "@/features/ops/lib/operatorAccess";
import { TechnicianCopilotShell } from "@/features/copilot/technician/components/TechnicianCopilotShell";
import {
  canAccessShopAssistant,
  canonicalizeRole,
} from "@/features/shared/lib/rbac";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";

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
    className="app-shell-action inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm backdrop-blur-md transition-colors"
    style={{
      borderColor: "var(--theme-border-soft)",
      background: "var(--theme-gradient-panel)",
      color: "var(--theme-text-primary)",
    }}
  >
    {children}
  </button>
);

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

type InboxConversationSummary = {
  conversation: { id: string };
  unread_count?: number | null;
  latest_message?: { id: string; sender_id: string | null } | null;
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
  initialOutsideDesktopShell = false,
}: {
  children: React.ReactNode;
  initialIdentity?: AppShellInitialIdentity | null;
  initialOutsideDesktopShell?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const { data: activeBrand } = useActiveBrand();

  const [userId, setUserId] = useState<string | null>(
    initialIdentity?.userId ?? null,
  );
  const [userEmail, setUserEmail] = useState<string | null>(
    initialIdentity?.email ?? null,
  );
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [role, setRole] = useState<string | null>(
    initialIdentity?.role ?? null,
  );
  const [, setShopId] = useState<string | null>(
    initialIdentity?.shopId ?? null,
  );
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [trialEndIso, setTrialEndIso] = useState<string | null>(null);
  const [periodEndIso, setPeriodEndIso] = useState<string | null>(null);

  const trialDaysLeft = daysUntil(trialEndIso);
  const periodDaysLeft = daysUntil(periodEndIso);

  const [punchOpen, setPunchOpen] = useState(false);
  const [headerShiftState, setHeaderShiftState] =
    useState<MobileShiftState | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [incomingConvoId, setIncomingConvoId] = useState<string | null>(null);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const inboxKnownMessages = useRef<Map<string, string>>(new Map());
  const inboxInitialized = useRef(false);
  const pendingRealtimeMessageIds = useRef<Set<string>>(new Set());
  const inboxRequestGeneration = useRef(0);
  const {
    preferences,
    loading: preferencesLoading,
    saving: preferencesSaving,
    loadError: preferencesLoadError,
    update: updatePreferences,
  } = useNotificationPreferences(userId);
  // Ref is updated during render, so a response that started before the user
  // disabled popups cannot use an obsolete callback closure to show a toast.
  const popupPreferencesRef = useRef({
    userId,
    loading: preferencesLoading,
    messagePopups: preferences.messagePopups,
    assistantPopups: preferences.assistantPopups,
  });
  popupPreferencesRef.current = {
    userId,
    loading: preferencesLoading,
    messagePopups: preferences.messagePopups,
    assistantPopups: preferences.assistantPopups,
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const punchRef = useRef<HTMLDivElement | null>(null);

  const isAppRoute =
    !initialOutsideDesktopShell && !isOutsideDesktopAppShell(pathname);

  const canSeeAgentConsole = isDefaultOpsOperatorEmail(userEmail);
  const canonicalRole = canonicalizeRole(role);
  const canUseOperationsAssistant = Boolean(
    userId &&
      canAccessShopAssistant(role) &&
      canonicalRole !== "mechanic",
  );
  const isMobileWorkOrderDetail = /^\/mobile\/work-orders\/[^/]+$/i.test(
    pathname,
  );

  const showBillingBadge = isBillingAttentionStatus(subStatus);

  const billingHref = "/dashboard/owner/settings#billing";

  const loadInboxUnreadCount = useCallback(async () => {
    const generation = ++inboxRequestGeneration.current;
    if (!userId || !isAppRoute) {
      setInboxUnreadCount(0);
      return;
    }

    const response = await fetch("/api/chat/my-conversations", {
      credentials: "include",
    }).catch(() => null);
    if (!response?.ok || generation !== inboxRequestGeneration.current) return;

    const conversations = (await response
      .json()
      .catch(() => [])) as InboxConversationSummary[];
    if (!Array.isArray(conversations) || generation !== inboxRequestGeneration.current ||
        popupPreferencesRef.current.userId !== userId) return;
    const count = conversations.reduce(
      (sum, row) => sum + Math.max(0, Number(row.unread_count ?? 0)),
      0,
    );
    // The server has already filtered conversation membership and unread
    // deliveries. Never show popups directly from a broad realtime event.
    const known = inboxKnownMessages.current;
    for (const row of conversations) {
      const message = row.latest_message;
      if (!message?.id) continue;
      const unseen = known.get(row.conversation.id) !== message.id;
      known.set(row.conversation.id, message.id);
      if (
        (inboxInitialized.current || pendingRealtimeMessageIds.current.has(message.id)) &&
        unseen && row.unread_count &&
        message.sender_id !== userId &&
        popupPreferencesRef.current.userId === userId &&
        !popupPreferencesRef.current.loading &&
        popupPreferencesRef.current.messagePopups &&
        claimNotificationPopup(userId, "message", message.id)
      ) {
        toast.info("New inbox message", {
          description: "A customer or teammate sent a message.",
          action: {
            label: "Open conversation",
            onClick: () => {
              setIncomingConvoId(row.conversation.id);
              setChatOpen(true);
            },
          },
        });
      }
    }
    if (generation !== inboxRequestGeneration.current || popupPreferencesRef.current.userId !== userId) return;
    pendingRealtimeMessageIds.current.clear();
    inboxInitialized.current = true;
    setInboxUnreadCount(count);
  }, [isAppRoute, userId, preferencesLoading, preferences.messagePopups]);

  useEffect(() => {
    setUserId(initialIdentity?.userId ?? null);
    setUserEmail(initialIdentity?.email ?? null);
    setRole(initialIdentity?.role ?? null);
    setShopId(initialIdentity?.shopId ?? null);
  }, [
    initialIdentity?.email,
    initialIdentity?.role,
    initialIdentity?.shopId,
    initialIdentity?.userId,
  ]);

  useEffect(() => {
    if (!isAppRoute) return;

    let active = true;
    let cleanup: (() => void) | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;

      const uid = session?.user?.id ?? null;
      if (!uid) {
        if (!initialIdentity?.userId) {
          setUserId(null);
          setUserEmail(null);
          setRole(null);
          setShopId(null);
          setMustChangePassword(false);
          setSubStatus(null);
          setTrialEndIso(null);
          setPeriodEndIso(null);
        }
        return;
      }

      setUserId(uid);
      setUserEmail(session?.user?.email ?? initialIdentity?.email ?? null);

      try {
        const { profile, error } = await resolveCanonicalStaffProfile(
          supabase,
          uid,
        );
        if (!active) return;

        if (error) {
          console.error("Failed to load profile for AppShell", error);
        } else {
          setUserEmail(profile?.email ?? session?.user?.email ?? null);
          setMustChangePassword(!!profile?.must_change_password);
          setRole(profile?.role ?? null);

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
            if (!active) return;

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
        }
      } catch (err) {
        if (active) {
          console.error("Failed to load profile/shop for AppShell", err);
        }
      }

      if (!active) return;
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
            if (!active) return;
            const raw = payload.new as unknown;
            const msg =
              raw as Database["public"]["Tables"]["messages"]["Row"] & {
                recipients?: string[] | null;
              };

            if (msg.sender_id === uid && msg.sender_kind === "staff") return;
            if (Array.isArray(msg.recipients) && !msg.recipients.includes(uid))
              return;

            // Realtime is only an invalidation signal. The authorized
            // conversations endpoint decides whether the event is visible.
            // Remember events during a failed initial baseline fetch so the
            // next successful authorized read can still surface them.
            if (msg.id) pendingRealtimeMessageIds.current.add(msg.id);
            window.dispatchEvent(
              new CustomEvent("profixiq:inbox-refresh", {
                detail: { conversationId: msg.conversation_id },
              }),
            );
          },
        )
        .subscribe();

      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })();

    return () => {
      active = false;
      cleanup?.();
    };
  }, [
    supabase,
    isAppRoute,
    initialIdentity?.email,
    initialIdentity?.role,
    initialIdentity?.shopId,
    initialIdentity?.userId,
  ]);

  useEffect(() => {
    inboxRequestGeneration.current += 1;
    inboxKnownMessages.current = new Map();
    pendingRealtimeMessageIds.current = new Set();
    inboxInitialized.current = false;
  }, [userId]);

  // Confirmations are durable assistant actions. Baseline existing items
  // silently, then toast only newly observed pending action IDs.
  useEffect(() => {
    if (!isAppRoute || !userId || !canUseOperationsAssistant ||
        preferencesLoading || !preferences.assistantPopups) return;
    let active = true;
    const baselineAt = Date.now();
    const known = new Set<string>();
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch("/api/shop-assistant/actions/pending", {
        cache: "no-store",
      }).catch(() => null);
      if (!active || !response?.ok) return;
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; actions?: Array<{
          id: string; threadId: string; createdAt: string; preview?: { title?: string };
        }> }
        | null;
      if (!active || payload?.ok !== true || !Array.isArray(payload.actions)) return;
      for (const action of payload.actions) {
        if (!action.id) continue;
        const unseen = !known.has(action.id);
        known.add(action.id);
        if (active && unseen &&
            isNewAssistantAction(action.createdAt, baselineAt) &&
            popupPreferencesRef.current.userId === userId &&
            !popupPreferencesRef.current.loading &&
            popupPreferencesRef.current.assistantPopups &&
            claimNotificationPopup(userId, "assistant", action.id)) {
          toast.info("ProFix Operations needs your confirmation", {
            description: action.preview?.title ?? "An action is waiting for review.",
            action: {
              label: "Review",
              onClick: () => router.push(
                action.threadId
                  ? `/assistant?threadId=${encodeURIComponent(action.threadId)}`
                  : "/assistant",
              ),
            },
          });
        }
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 45_000);
    const visibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [isAppRoute, userId, canUseOperationsAssistant,
      preferencesLoading, preferences.assistantPopups, router]);

  useEffect(() => {
    if (!isAppRoute || !userId) {
      setInboxUnreadCount(0);
      return;
    }

    void loadInboxUnreadCount();
    const refresh = () => {
      void loadInboxUnreadCount();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("profixiq:inbox-refresh", refresh);
    window.addEventListener("profixiq:inbox-read", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("profixiq:inbox-refresh", refresh);
      window.removeEventListener("profixiq:inbox-read", refresh);
    };
  }, [isAppRoute, loadInboxUnreadCount, userId]);

  useEffect(() => {
    if (!userId) {
      setHeaderShiftState(null);
      return;
    }
    void fetchMobileShiftState()
      .then(setHeaderShiftState)
      .catch(() => setHeaderShiftState(null));
    const onShiftState = (event: Event) => {
      setHeaderShiftState((event as CustomEvent<MobileShiftState>).detail);
    };
    window.addEventListener("workforce:shift-state", onShiftState);
    return () =>
      window.removeEventListener("workforce:shift-state", onShiftState);
  }, [userId]);

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

  const NavItem = ({
    href,
    label,
    badge = 0,
  }: {
    href: string;
    label: string;
    badge?: number;
  }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={cn(
          "flex-1 py-2 text-center text-xs font-medium transition-colors",
          active
            ? "font-semibold text-[color:var(--theme-text-primary)]"
            : "text-[color:var(--theme-text-muted)] hover:text-[color:var(--theme-text-primary)]",
        )}
        style={active ? { color: "var(--brand-accent, #E39A6E)" } : undefined}
      >
        <span className="relative inline-flex items-center gap-1">
          {label}
          {badge > 0 ? (
            <span className="rounded-full bg-[var(--accent-copper-soft)] px-1 py-0.5 text-[9px] font-bold leading-none text-[color:var(--theme-text-on-accent)]">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
      </Link>
    );
  };

  if (!isAppRoute) {
    return (
      <div className="min-h-screen text-[var(--theme-text-primary,var(--theme-text-primary))]">
        {children}
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
              background: "var(--theme-gradient-panel)",
              color: "var(--theme-text-primary)",
            }}
          >
            <span style={{ color: "var(--brand-accent, #E39A6E)" }}>Trial</span>
            <span className="ml-2 text-[color:var(--theme-text-secondary)]">
              {label}
            </span>
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
          inert={!sidebarOpen}
          aria-hidden={!sidebarOpen}
          className={cn(
            "hidden shrink-0 overflow-hidden border-r backdrop-blur-xl transition-all duration-300 md:flex md:flex-col",
            HEADER_OFFSET_DESKTOP,
            sidebarOpen
              ? "translate-x-0 border-r md:w-52 lg:w-56 xl:w-60"
              : "pointer-events-none -translate-x-full md:w-0",
          )}
          style={{
            borderColor: "var(--metal-border-soft, rgba(148,163,184,0.3))",
            background: "var(--theme-gradient-panel)",
          }}
        >
          <div
            className={cn(
              "flex h-full flex-col transition-opacity duration-200",
              sidebarOpen ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="flex h-12 items-center justify-between border-b border-[color:var(--theme-border-soft)] px-3 xl:px-4">
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
              initialRole={role}
              initialEmail={userEmail}
              showQueueIndicators={!preferencesLoading && preferences.navigationIndicators}
              inboxUnreadCount={inboxUnreadCount}
              userId={userId}
            />

            <div className="mt-auto h-12 border-t border-[color:var(--theme-border-soft)]" />
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header
            className="fixed inset-x-0 top-0 z-30 hidden h-12 items-center justify-between border-b px-3 backdrop-blur-xl md:flex lg:px-4"
            style={{
              borderColor:
                "color-mix(in srgb, var(--brand-primary, #C1663B) 30%, var(--metal-border-soft, rgba(148,163,184,0.3)))",
              background: "var(--theme-gradient-panel)",
              boxShadow:
                "0 18px 40px var(--theme-surface-inset), 0 0 26px color-mix(in srgb, var(--brand-primary, #C1663B) 18%, transparent)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-secondary)] shadow-sm transition hover:text-[color:var(--theme-text-primary)]"
              >
                <span className="sr-only">Toggle navigation</span>
                <div className="space-y-0.5">
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                  <span className="block h-[2px] w-4 rounded-full bg-current" />
                </div>
              </button>

              <nav className="flex gap-3 text-sm text-[color:var(--theme-text-secondary)]">
                <Link
                  href="/dashboard"
                  className="hover:text-[color:var(--theme-text-primary)]"
                >
                  Dashboard
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-1.5 lg:gap-2">
              <BillingBadge />

              {userId && canSeeAgentConsole ? <OpsNotificationsBell /> : null}
              {userId ? (
                <NotificationPreferencesButton
                  preferences={preferences}
                  loading={preferencesLoading}
                  saving={preferencesSaving}
                  loadError={preferencesLoadError}
                  update={updatePreferences}
                />
              ) : null}

              {userId ? (
                <ActionButton
                  onClick={() => setPunchOpen((p) => !p)}
                  title="Punch / shift tracker"
                >
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      headerShiftState?.activity === "working"
                        ? "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]"
                        : headerShiftState?.activity === "on_break" ||
                            headerShiftState?.activity === "on_lunch"
                          ? "bg-amber-400"
                          : "bg-slate-400",
                    )}
                  />
                  {headerShiftState?.activity === "working"
                    ? "Working"
                    : headerShiftState?.activity === "on_break"
                      ? "Break"
                      : headerShiftState?.activity === "on_lunch"
                        ? "Lunch"
                        : "Shift"}
                </ActionButton>
              ) : null}

              <ActionButton onClick={() => setChatOpen(true)} title="Inbox">
                <span>Inbox</span>
                {inboxUnreadCount > 0 ? (
                  <span className="ml-0.5 rounded-full bg-[var(--accent-copper-soft)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[color:var(--theme-text-on-accent)]">
                    {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
                  </span>
                ) : null}
              </ActionButton>

              {userId ? (
                <ActionButton
                  onClick={() => setAgentDialogOpen(true)}
                  title="Report an issue or suggest an improvement"
                >
                  <span>Product Feedback</span>
                </ActionButton>
              ) : null}

              {canUseOperationsAssistant ? (
                <AskAssistantEntry placement="header" role={role} />
              ) : null}

              {userId && canSeeAgentConsole ? (
                <ActionButton
                  onClick={() => router.push("/ops")}
                  title="ProFixIQ Ops Console"
                >
                  <span>Ops Console</span>
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
                background: "var(--theme-gradient-panel)",
                boxShadow: "var(--theme-shadow-medium)",
              }}
            >
              <h2 className="mb-2 text-sm font-medium text-[color:var(--theme-text-primary)]">
                Shift Tracker
              </h2>
              <ShiftTracker userId={userId} />
            </div>
          ) : null}

          <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden px-3 pb-14 pt-16 md:px-4 md:pb-6 md:pt-16 lg:px-6 lg:pt-[4.25rem] xl:px-8 2xl:px-10">
            <TabsBridge tabsSubdued={chatOpen}>
              <div className="relative z-0 mx-auto w-full max-w-[1800px] min-w-0">
                {children}
              </div>
            </TabsBridge>
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            style={{
              borderColor: "var(--metal-border-soft, rgba(148,163,184,0.3))",
              background: "var(--theme-gradient-panel)",
            }}
          >
            <div className="flex px-1">
              <NavItem href="/dashboard" label="Dashboard" />
              <NavItem href="/work-orders" label="Work Orders" />
              <NavItem href="/inspections" label="Inspections" />
              <NavItem href="/chat" label="Inbox" badge={inboxUnreadCount} />
              <NavItem href="/mobile/appointments" label="Schedule" />
              {userId ? (
                <NotificationPreferencesButton
                  mobile
                  preferences={preferences}
                  loading={preferencesLoading}
                  saving={preferencesSaving}
                  loadError={preferencesLoadError}
                  update={updatePreferences}
                />
              ) : null}

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/sign-in");
                }}
                className="flex-1 py-2 text-center text-xs font-medium text-[color:var(--theme-text-muted)] transition-colors hover:text-[color:var(--theme-text-primary)]"
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

      {canUseOperationsAssistant && !isMobileWorkOrderDetail ? (
        <div className="md:hidden">
          <AskAssistantEntry mobile role={role} />
        </div>
      ) : null}

      <TechnicianCopilotShell
        shouldCheck={canonicalRole === "mechanic"}
        surface="desktop"
      />
    </>
  );
}
