"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PortalNotificationRow = DB["public"]["Tables"]["portal_notifications"]["Row"];

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const COPPER = "#C57A4A";

export default function PortalNotificationsBell() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [items, setItems] = useState<PortalNotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      // RLS should already scope to current portal user
      const { data, error } = await supabase
        .from("portal_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!mounted) return;

      if (error) {
        console.error("[portal notifications] load failed:", error.message);
        setItems([]);
      } else if (data) {
        setItems(data);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  const unreadCount = items.filter(
    (n) => "read_at" in n ? n.read_at == null : true,
  ).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={classNames(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs",
          "border-white/18 bg-black/40 text-neutral-100 hover:bg-black/70 active:scale-95",
        )}
        aria-label="Notifications"
      >
        {/* simple bell glyph */}
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.6rem] font-semibold"
            style={{ backgroundColor: COPPER }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-white/15 bg-black/90 p-3 text-xs text-neutral-100 shadow-[0_18px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[0.7rem] uppercase tracking-[0.18em] text-neutral-400">
              Notifications
            </div>
            {loading && (
              <div className="text-[0.7rem] text-neutral-500">Loading…</div>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/40 px-3 py-3 text-[0.7rem] text-neutral-400">
              You don&apos;t have any notifications yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={classNames(
                    "rounded-xl border px-3 py-2",
                    "border-white/10 bg-black/40",
                    "hover:border-white/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
                        {item.kind?.replaceAll("_", " ") ?? "Update"}
                      </div>
                      <div className="mt-0.5 text-[0.8rem] font-semibold text-neutral-100">
                        {item.title ?? "Notification"}
                      </div>
                      {item.body && (
                        <div className="mt-0.5 text-[0.75rem] text-neutral-300">
                          {item.body}
                        </div>
                      )}
                    </div>
                  </div>
                  {item.created_at && (
                    <div className="mt-1 text-[0.65rem] text-neutral-500">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}