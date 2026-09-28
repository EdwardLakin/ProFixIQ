const KEY = "profixiq:shown-notification-popups";
const MAX_ENTRIES = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Best-effort cross-tab deduplication; no message content is stored. */
export function claimNotificationPopup(userId: string, category: string, id: string): boolean {
  if (typeof window === "undefined") return false;
  const key = `${userId}:${category}:${id}`;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, number> : {};
    const now = Date.now();
    const fresh = Object.entries(parsed).filter(
      ([, timestamp]) => typeof timestamp === "number" && now - timestamp < MAX_AGE_MS,
    );
    if (fresh.some(([value]) => value === key)) return false;
    const next = Object.fromEntries(
      [...fresh, [key, now]].slice(-MAX_ENTRIES),
    );
    window.localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    // Storage disabled: still deliver notification in this tab.
    return true;
  }
}
