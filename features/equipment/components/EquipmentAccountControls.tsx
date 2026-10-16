"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import InboxModal from "@/features/chat/components/InboxModal";
import { useNotificationPreferences } from "@/features/shared/hooks/useNotificationPreferences";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type ConversationSummary = { unread_count?: number | null };

const REFRESH_MS = 60_000;
const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Account controls the Equipment shell needs now that /equipment no longer
 * renders inside the Shop AppShell: the shared inbox (with its unread badge) and
 * sign out. The inbox reads the same /api/chat/my-conversations endpoint and
 * opens the same InboxModal as the Shop shell.
 */
export default function EquipmentAccountControls() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const generation = useRef(0);
  const [userId, setUserId] = useState<string | null>(null);
  // The same account-wide preference the Shop shell honors for its Inbox badge.
  const { preferences, loading: preferencesLoading } = useNotificationPreferences(userId);
  const showBadge = !preferencesLoading && preferences.navigationIndicators;

  useEffect(() => {
    let active = true;
    void createBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user?.id ?? null);
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const response = await fetch("/api/chat/my-conversations", {
      credentials: "include",
    }).catch(() => null);
    if (!response?.ok || current !== generation.current) return;
    const rows = (await response.json().catch(() => [])) as unknown;
    if (!Array.isArray(rows) || current !== generation.current) return;
    setUnread(
      (rows as ConversationSummary[]).reduce(
        (sum, row) => sum + Math.max(0, Number(row.unread_count ?? 0)),
        0,
      ),
    );
  }, []);

  useEffect(() => {
    void refresh();
    const onRefresh = () => void refresh();
    const interval = window.setInterval(onRefresh, REFRESH_MS);
    window.addEventListener("profixiq:inbox-refresh", onRefresh);
    window.addEventListener("profixiq:inbox-read", onRefresh);
    return () => {
      generation.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("profixiq:inbox-refresh", onRefresh);
      window.removeEventListener("profixiq:inbox-read", onRefresh);
    };
  }, [refresh]);

  return (
    <>
      <div className="flex items-center gap-2 lg:flex-col lg:items-stretch">
        <button type="button" className={BUTTON} onClick={() => setOpen(true)}>
          <span>Inbox</span>
          {showBadge && unread > 0 ? (
            <span
              className="rounded-full bg-[color:var(--accent-copper)] px-1.5 text-xs font-bold text-white"
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
        {/* GET /auth/signout clears the session server-side and lands on "/". */}
        <a href="/auth/signout" className={BUTTON}>
          Sign out
        </a>
      </div>
      <InboxModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
