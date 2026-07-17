"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  clearOfflineState,
  getOfflineSyncSummary,
  hydrateOfflineMutationQueue,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { replayAllOfflineMutations } from "@/features/shared/lib/offline/replay";
import { isStandalonePublicRoute } from "@/features/shared/lib/routes/shellBoundaries";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRuntime() {
  const pathname = usePathname() ?? "/";
  const [online, setOnline] = useState(true);
  const [summary, setSummary] = useState(() => getOfflineSyncSummary());
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [iosInstallAvailable, setIosInstallAvailable] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [activatingUpdate, setActivatingUpdate] = useState(false);
  const [syncBlocked, setSyncBlocked] = useState<string | null>(null);
  const [viewportInsets, setViewportInsets] = useState({ bottom: 0, right: 0 });
  const updateReloading = useRef(false);
  const pending = summary.queued + summary.syncing + summary.failed;

  useEffect(() => {
    setOnline(navigator.onLine);
    const iosDevice =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIosInstallAvailable(iosDevice && !standalone);

    const updateViewportInsets = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;
      const next = {
        bottom: Math.max(
          0,
          Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
        ),
        right: Math.max(
          0,
          Math.round(window.innerWidth - viewport.width - viewport.offsetLeft),
        ),
      };
      setViewportInsets((current) =>
        current.bottom === next.bottom && current.right === next.right
          ? current
          : next,
      );
    };
    updateViewportInsets();
    window.visualViewport?.addEventListener("resize", updateViewportInsets);
    window.visualViewport?.addEventListener("scroll", updateViewportInsets);
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
      if (profile?.shop_id)
        setOfflineMutationScope({ userId, shopId: profile.shop_id });
    };
    void supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (userId) await resolveScope(userId);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") void clearOfflineState();
        if (session?.user.id)
          window.setTimeout(() => void resolveScope(session.user.id), 0);
      },
    );
    const unsubscribe = subscribeOfflineMutations(() =>
      setSummary(getOfflineSyncSummary()),
    );
    const sync = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        void replayAllOfflineMutations()
          .then(() => setSyncBlocked(null))
          .catch((cause: unknown) => {
            setSyncBlocked(
              cause instanceof Error
                ? cause.message
                : "Saved work could not be verified for sync.",
            );
          });
      }
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
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
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
      window.visualViewport?.removeEventListener("resize", updateViewportInsets);
      window.visualViewport?.removeEventListener("scroll", updateViewportInsets);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const activateUpdate = () => {
    if (!updateReady || activatingUpdate) return;
    setActivatingUpdate(true);
    const reloadWhenControlled = () => {
      if (updateReloading.current) return;
      updateReloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      reloadWhenControlled,
      {
        once: true,
      },
    );
    updateReady.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(reloadWhenControlled, 8_000);
  };

  if (
    isStandalonePublicRoute(pathname) ||
    (online &&
      pending === 0 &&
      !installPrompt &&
      !iosInstallAvailable &&
      !updateReady &&
      !syncBlocked)
  ) {
    return null;
  }

  return (
    <div
      className="fixed z-[100] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur sm:flex-nowrap sm:rounded-full"
      style={{
        bottom: `calc(1rem + env(safe-area-inset-bottom, 0px) + ${viewportInsets.bottom}px)`,
        right: `calc(1rem + env(safe-area-inset-right, 0px) + ${viewportInsets.right}px)`,
      }}
    >
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`}
      />
      <span>
        {syncBlocked
          ? "Sync needs attention"
          : online
          ? pending
            ? `Syncing ${pending}`
            : "Online"
          : `Offline · ${pending} pending`}
      </span>
      {syncBlocked && <span className="sr-only">{syncBlocked}</span>}
      {installPrompt && (
        <button
          type="button"
          onClick={() => void install()}
          className="rounded-full bg-sky-400 px-3 py-1 text-slate-950"
        >
          Install
        </button>
      )}
      {!installPrompt && iosInstallAvailable && (
        <button
          type="button"
          onClick={() => setShowIosInstructions(true)}
          className="rounded-full bg-sky-400 px-3 py-1 text-slate-950"
        >
          Install
        </button>
      )}
      {(pending > 0 || !online || syncBlocked) && (
        <button
          type="button"
          onClick={() => window.location.assign("/offline/sync")}
          className="rounded-full border border-slate-600 px-3 py-1"
        >
          Details
        </button>
      )}
      {updateReady && (
        <button
          type="button"
          onClick={activateUpdate}
          disabled={activatingUpdate || pending > 0}
          className="rounded-full bg-sky-400 px-3 py-1 text-slate-950"
        >
          {activatingUpdate
            ? "Updating…"
            : pending > 0
              ? "Sync before update"
              : "Update"}
        </button>
      )}
      {showIosInstructions && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left shadow-2xl"
          >
            <h2 id="ios-install-title" className="text-lg font-semibold">
              Install ProFixIQ on iPhone or iPad
            </h2>
            <ol className="mt-4 space-y-3 text-sm font-normal text-slate-300">
              <li>
                <span className="font-semibold text-slate-100">1.</span> Open
                this page in Safari.
              </li>
              <li>
                <span className="font-semibold text-slate-100">2.</span> Tap the
                Share button in Safari.
              </li>
              <li>
                <span className="font-semibold text-slate-100">3.</span> Choose{" "}
                <span className="font-semibold text-slate-100">
                  Add to Home Screen
                </span>
                , then tap Add.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIosInstructions(false)}
              className="mt-5 w-full rounded-xl bg-sky-400 px-4 py-2 font-semibold text-slate-950"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
