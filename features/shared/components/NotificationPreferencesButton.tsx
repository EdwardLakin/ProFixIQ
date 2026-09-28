"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import type { NotificationPreferences } from "@/features/shared/hooks/useNotificationPreferences";

type Props = {
  preferences: NotificationPreferences;
  loading: boolean;
  saving: boolean;
  loadError: boolean;
  mobile?: boolean;
  update: (key: keyof NotificationPreferences, enabled: boolean) => Promise<void>;
};

const OPTIONS: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  { key: "navigationIndicators", label: "Navigation indicators",
    description: "Show outstanding work in navigation." },
  { key: "messagePopups", label: "Message popups",
    description: "Show new messages while using the app." },
  { key: "assistantPopups", label: "Assistant popups",
    description: "Show newly pending assistant confirmations." },
];

export default function NotificationPreferencesButton({
  preferences, loading, saving, loadError, mobile = false, update,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notification preferences"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="app-shell-action inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 text-xs text-[color:var(--theme-text-primary)]"
      >
        <Bell className="h-4 w-4" />
        <span className="sr-only">Notifications</span>
      </button>
      {open ? (
        <div role="group" aria-label="Notification preferences"
          className={`${mobile ? "fixed" : "absolute"} z-50 space-y-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-4 shadow-xl ${mobile ? "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-3 right-3 mx-auto max-w-[22rem]" : "right-0 mt-2 w-[min(22rem,90vw)]"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">My notifications</h2>
            <button type="button" onClick={() => setOpen(false)}
              aria-label="Close notification preferences"
              className="rounded-md p-1 text-xs text-[color:var(--theme-text-secondary)]">
              Close
            </button>
          </div>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Turning off popups does not hide messages or outstanding work.
            Settings follow your account across devices.
          </p>
          {OPTIONS.map(({ key, label, description }) => (
            <label key={key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-1">
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{label}</span>
                <span className="block text-[11px] text-[color:var(--theme-text-secondary)]">{description}</span>
              </span>
              <input
                type="checkbox"
                checked={preferences[key]}
                disabled={loading || saving || loadError}
                onChange={(event) => void update(key, event.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--brand-primary,#C1663B)]"
              />
            </label>
          ))}
          {loadError ? (
            <span role="alert" className="text-[11px] text-red-600">Preferences could not be loaded. Popups are off until your settings can be verified. Refresh to retry.</span>
          ) : !loading && !saving ? (
            <span className="flex items-center gap-1 text-[10px] text-[color:var(--theme-text-muted)]">
              <Check className="h-3 w-3" /> Saved to your account
            </span>
          ) : (
            <span className="text-[10px] text-[color:var(--theme-text-muted)]">
              {loading ? "Loading preferences…" : "Saving…"}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
