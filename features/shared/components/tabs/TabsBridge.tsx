// features/shared/components/tabs/TabsBridge.tsx
"use client";

import { useEffect, useMemo, } from "react";
import { useSession } from "@supabase/auth-helpers-react";
import { usePathname } from "next/navigation";
import { TabsProvider } from "./TabsProvider";
import TabsBar from "./TabsBar";
import { metaFor } from "@/features/shared/lib/routeMeta"; // adjust path if different

/**
 * Build a stable, user-scoped storage prefix for the current route.
 * Example: tabs:u_123:/work-orders/abc → "tabs:u_123:_work_orders_abc"
 */
function useStoragePrefix(userId?: string | null) {
  const pathname = usePathname() || "/";
  const safePath = pathname.replace(/\W+/g, "_"); // "/work-orders/123" → "_work_orders_123"
  const userPart = userId ? `u_${userId}` : "anon";
  return `tabs:${userPart}:${safePath}`;
}

/**
 * Public helper in case a page wants to persist extra blobs manually.
 * Example: const key = useTabsScopedStorageKey("assistant:thread")
 */
export function useTabsScopedStorageKey(subkey: string) {
  const session = useSession();
  const prefix = useStoragePrefix(session?.user?.id);
  return `${prefix}:${subkey}`;
}

export default function TabsBridge({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const userId = session?.user?.id ?? null;
  const pathname = usePathname() || "/";
  const prefix = useStoragePrefix(userId);

  // Ask routeMeta what the persistence policy is (defaults: inputs+scroll true for all).
  const persist = useMemo(() => metaFor(pathname).persist, [pathname]);

  // ---------- INPUT PERSISTENCE (universal, opt-out per route in routeMeta) ----------
  useEffect(() => {
    if (!persist?.inputs) return;

    const STORAGE_KEY = `${prefix}:inputs`;
    // Try to restore once on mount/route-change
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string>;
        // Match by name or id only (avoid type=password/file)
        for (const [k, v] of Object.entries(map)) {
          const el =
            (document.querySelector(`input[name="${k}"]`) as HTMLInputElement | null) ||
            (document.getElementById(k) as HTMLInputElement | null) ||
            (document.querySelector(`textarea[name="${k}"]`) as HTMLTextAreaElement | null) ||
            (document.querySelector(`select[name="${k}"]`) as HTMLSelectElement | null);
          if (!el) continue;
          const tag = el.tagName.toLowerCase();
          const type = (el as HTMLInputElement).type?.toLowerCase?.() || "";
          if (tag === "input" && (type === "password" || type === "file")) continue;

          if (tag === "input" || tag === "textarea") {
            (el as HTMLInputElement | HTMLTextAreaElement).value = v;
            el.dispatchEvent(new Event("input", { bubbles: true })); // keep React state in sync
          } else if (tag === "select") {
            (el as HTMLSelectElement).value = v;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
    } catch {
      /* noop */
    }

    // Write-through on user edits (debounced)
    let t: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try {
          const map: Record<string, string> = {};
          const fields = Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
              "input, textarea, select",
            ),
          );
          fields.forEach((el, idx) => {
            const tag = el.tagName.toLowerCase();
            const type = (el as HTMLInputElement).type?.toLowerCase?.() || "";
            if (tag === "input" && (type === "password" || type === "file")) return;

            const key = el.getAttribute("name") || el.id || `__idx_${idx}`;
            // Only store if we have a stable key
            if (!key) return;

            // Coerce to string
            const val =
              tag === "select"
                ? (el as HTMLSelectElement).value ?? ""
                : (el as HTMLInputElement | HTMLTextAreaElement).value ?? "";

            map[key] = val;
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        } catch {
          /* noop */
        }
      }, 150);
    };

    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") save();
    };

    document.addEventListener("input", handler, true);
    document.addEventListener("change", handler, true);
    window.addEventListener("beforeunload", save);

    return () => {
      document.removeEventListener("input", handler, true);
      document.removeEventListener("change", handler, true);
      window.removeEventListener("beforeunload", save);
      if (t) clearTimeout(t);
    };
  }, [persist?.inputs, prefix]);

  // ---------- SCROLL PERSISTENCE (window scroll only, opt-out per route) ----------
  useEffect(() => {
    if (!persist?.scroll) return;

    const SCROLL_KEY = `${prefix}:scrollY`;

    // Restore immediately (next frame ensures layout is ready)
    const id = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem(SCROLL_KEY);
        const y = raw ? parseInt(raw, 10) : 0;
        if (!Number.isNaN(y)) window.scrollTo({ top: y, behavior: "auto" });
      } catch {
        /* noop */
      }
    });

    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        try {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
        } catch {
          /* noop */
        }
      }, 100);
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", onScroll);
      if (t) clearTimeout(t);
    };
  }, [persist?.scroll, prefix]);

  // ---------- Tabs UI + children ----------
  return (
    <TabsProvider userId={userId ?? undefined}>
      <TabsBar />
      {children}
    </TabsProvider>
  );
}