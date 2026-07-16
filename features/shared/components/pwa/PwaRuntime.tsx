"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  clearOfflineState,
  getOfflineSyncSummary,
  hydrateOfflineMutationQueue,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { replayAllOfflineMutations } from "@/features/shared/lib/offline/replay";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRuntime() {
  const [online, setOnline] = useState(true);
  const [summary, setSummary] = useState(() => getOfflineSyncSummary());
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const pending = summary.queued + summary.syncing + summary.failed;

  useEffect(() => {
    setOnline(navigator.onLine);
    void hydrateOfflineMutationQueue();
    void navigator.storage?.persist?.().catch(() => false);

    const supabase = createBrowserSupabase();
    const resolveScope = async (userId: string) => {
      if (!navigator.onLine) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", userId)
        .maybeSingle();
      if (profile?.shop_id) setOfflineMutationScope({ userId, shopId: profile.shop_id });
    };
    void supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (userId) await resolveScope(userId);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") void clearOfflineState();
      if (session?.user.id) window.setTimeout(() => void resolveScope(session.user.id), 0);
    });
    const unsubscribe = subscribeOfflineMutations(() => setSummary(getOfflineSyncSummary()));
    const sync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void replayAllOfflineMutations();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("focus", sync);
    const interval = window.setInterval(sync, 60_000);

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
        if (registration.waiting) setUpdateReady(registration.waiting);
        registration.addEventListener("updatefound", () => {
          registration.installing?.addEventListener("statechange", () => {
            if (registration.waiting && navigator.serviceWorker.controller) {
              setUpdateReady(registration.waiting);
            }
          });
        });
      });
    }
    sync();

    return () => {
      authSubscription.subscription.unsubscribe();
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (online && pending === 0 && !installPrompt && !updateReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur">
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} />
      <span>{online ? (pending ? `Syncing ${pending}` : "Online") : `Offline · ${pending} pending`}</span>
      {installPrompt && <button type="button" onClick={() => void install()} className="rounded-full bg-sky-400 px-3 py-1 text-slate-950">Install</button>}
      {updateReady && (
        <button
          type="button"
          onClick={() => {
            updateReady.postMessage({ type: "SKIP_WAITING" });
            window.location.reload();
          }}
          className="rounded-full bg-sky-400 px-3 py-1 text-slate-950"
        >
          Update
        </button>
      )}
    </div>
  );
}
