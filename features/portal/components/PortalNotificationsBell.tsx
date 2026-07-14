"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PortalNotificationRow = DB["public"]["Tables"]["portal_notifications"]["Row"];
type RpcClient = ReturnType<typeof createBrowserSupabase> & {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function PortalNotificationsBell() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const rpc = supabase as RpcClient;
  const [items, setItems] = useState<PortalNotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("portal_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("portal-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "portal_notifications" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const markRead = useCallback(
    async (id: string) => {
      const { error } = await rpc.rpc("mark_portal_notification_read", {
        p_notification_id: id,
      });
      if (!error) {
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item,
          ),
        );
      }
    },
    [rpc],
  );

  const markAllRead = useCallback(async () => {
    const { error } = await rpc.rpc("mark_all_portal_notifications_read");
    if (!error) {
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    }
  }, [rpc]);

  const unreadCount = items.filter((item) => item.read_at == null).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-overlay)]"
        aria-label="Notifications"
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--accent-copper,#c57a4a)] px-1 text-[0.6rem] font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3 text-xs text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Notifications
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              className={classNames(
                "text-[0.7rem] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]",
                unreadCount === 0 && "opacity-40",
              )}
            >
              Mark all read
            </button>
          </div>

          {loading ? <div className="py-3 text-[color:var(--theme-text-muted)]">Loading…</div> : null}
          {!loading && items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
              You do not have any notifications yet.
            </div>
          ) : null}

          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className={classNames(
                    "w-full rounded-xl border px-3 py-2 text-left",
                    item.read_at
                      ? "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
                      : "border-[color:var(--accent-copper,#c57a4a)]/40 bg-[color:var(--accent-copper,#c57a4a)]/10",
                  )}
                >
                  <div className="text-[0.65rem] uppercase tracking-[0.15em] text-[color:var(--theme-text-muted)]">
                    {item.kind?.replaceAll("_", " ") ?? "Update"}
                  </div>
                  <div className="mt-0.5 text-[0.8rem] font-semibold text-[color:var(--theme-text-primary)]">
                    {item.title ?? "Notification"}
                  </div>
                  {item.body ? (
                    <div className="mt-0.5 text-[0.75rem] text-[color:var(--theme-text-secondary)]">{item.body}</div>
                  ) : null}
                  {item.created_at ? (
                    <div className="mt-1 text-[0.65rem] text-[color:var(--theme-text-muted)]">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
