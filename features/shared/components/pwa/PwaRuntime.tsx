"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  clearOfflineState,
  getOfflineMutationScope,
  getOfflineSyncSummary,
  getSessionMatchedOfflineScope,
  hydrateOfflineMutationQueue,
  recoverInterruptedOfflineMutations,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { removeFieldActiveSnapshot } from "@/features/mobile/service/fieldActiveSnapshot";
import { replayAllOfflineMutations } from "@/features/shared/lib/offline/replay";
import { isStandalonePublicRoute } from "@/features/shared/lib/routes/shellBoundaries";
import {
  clearPrivateNavigationCaches,
  PRIVATE_NAVIGATION_CACHE_CLEAR_MESSAGE,
} from "@/features/shared/lib/pwa/privateNavigationCache";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallAvailability = {
  available: boolean;
  ios: boolean;
};

type RuntimeStatus = {
  online: boolean;
  pending: number;
  queued: number;
  syncing: number;
  failed: number;
  conflicted: number;
  updateReady: boolean;
  activatingUpdate: boolean;
  syncBlocked: string | null;
};

const INSTALL_REQUEST_EVENT = "profixiq:pwa-install-request";
const INSTALL_AVAILABILITY_EVENT = "profixiq:pwa-install-availability";
const RUNTIME_STATUS_EVENT = "profixiq:pwa-runtime-status";
const RUNTIME_STATUS_REQUEST_EVENT = "profixiq:pwa-runtime-status-request";
const UPDATE_REQUEST_EVENT = "profixiq:pwa-update-request";

export default function PwaRuntime() {
  const pathname = usePathname() ?? "/";
  const [online, setOnline] = useState(true);
  const [summary, setSummary] = useState(() => getOfflineSyncSummary(null));
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [iosInstallAvailable, setIosInstallAvailable] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [activatingUpdate, setActivatingUpdate] = useState(false);
  const [syncBlocked, setSyncBlocked] = useState<string | null>(null);
  const [viewportInsets, setViewportInsets] = useState({ bottom: 0, right: 0 });
  const updateReloading = useRef(false);
  const pending = summary.queued + summary.syncing + summary.failed;
  const mobileSurface = pathname.startsWith("/mobile");
  const workOrderSurface = pathname.startsWith("/work-orders/");
  const [runtimeStatusTarget, setRuntimeStatusTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!workOrderSurface) {
      setRuntimeStatusTarget(null);
      return;
    }

    const resolveTarget = () => {
      const nextTarget = document.getElementById("work-order-runtime-status");
      setRuntimeStatusTarget((current) => (current === nextTarget ? current : nextTarget));
    };

    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [workOrderSurface]);

  const publishInstallAvailability = useCallback(
    (detail: InstallAvailability) => {
      window.dispatchEvent(
        new CustomEvent<InstallAvailability>(INSTALL_AVAILABILITY_EVENT, {
          detail,
        }),
      );
    },
    [],
  );

  const publishRuntimeStatus = useCallback(() => {
    const detail: RuntimeStatus = {
      online,
      pending,
      queued: summary.queued,
      syncing: summary.syncing,
      failed: summary.failed,
      conflicted: summary.conflicted,
      updateReady: Boolean(updateReady),
      activatingUpdate,
      syncBlocked,
    };
    window.dispatchEvent(
      new CustomEvent<RuntimeStatus>(RUNTIME_STATUS_EVENT, { detail }),
    );
  }, [
    activatingUpdate,
    online,
    pending,
    summary.conflicted,
    summary.failed,
    summary.queued,
    summary.syncing,
    syncBlocked,
    updateReady,
  ]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const iosDevice =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const iosAvailable = iosDevice && !standalone;
    setIosInstallAvailable(iosAvailable);
    publishInstallAvailability({ available: iosAvailable, ios: iosAvailable });

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

    void hydrateOfflineMutationQueue()
      .then(() => recoverInterruptedOfflineMutations())
      .catch((cause: unknown) => {
        setSyncBlocked(
          cause instanceof Error
            ? cause.message
            : "Interrupted saved work could not be recovered.",
        );
      });
    void navigator.storage?.persist?.().catch(() => false);
    void clearPrivateNavigationCaches({ includeCurrent: false });

    const supabase = createBrowserSupabase();
    let authEpoch = 0;
    const evictPrivateNavigationCaches = () => {
      void clearPrivateNavigationCaches();
      navigator.serviceWorker?.controller?.postMessage({
        type: PRIVATE_NAVIGATION_CACHE_CLEAR_MESSAGE,
      });
    };
    const evictPrivateNavigationForActorChange = (nextUserId: string | null) => {
      const formerScope = getOfflineMutationScope();
      if (nextUserId && formerScope?.userId === nextUserId) {
        return;
      }
      evictPrivateNavigationCaches();
      if (formerScope && nextUserId && formerScope.userId !== nextUserId) {
        setOfflineMutationScope(null);
      }
    };
    const resolveScope = async (userId: string, epoch: number) => {
      if (!navigator.onLine) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", userId)
        .maybeSingle();
      if (epoch !== authEpoch || !profile?.shop_id) return;
      const nextScope = { userId, shopId: profile.shop_id };
      const formerScope = getOfflineMutationScope();
      if (
        !formerScope ||
        formerScope.userId !== nextScope.userId ||
        formerScope.shopId !== nextScope.shopId
      ) {
        evictPrivateNavigationCaches();
      }
      setOfflineMutationScope(nextScope);
    };
    const activateActor = (userId: string | null) => {
      const epoch = ++authEpoch;
      evictPrivateNavigationForActorChange(userId);
      if (userId) {
        window.setTimeout(() => void resolveScope(userId, epoch), 0);
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (authEpoch !== 0) return;
        activateActor(data.session?.user.id ?? null);
      })
      .catch(() => {
        if (authEpoch === 0) activateActor(null);
      });

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          const formerScope = getOfflineMutationScope();
          if (formerScope) removeFieldActiveSnapshot(formerScope);
          activateActor(null);
          // Signing out must never destroy work that has not reached the
          // server. Unsent mutations and their attachments are retained for the
          // former identity and replay when that identity signs back in.
          void clearOfflineState({ preserveUnsyncedWork: true });
        } else if (session?.user.id) {
          activateActor(session.user.id);
        }
      },
    );

    const refreshSummary = () => {
      void getSessionMatchedOfflineScope().then((scope) =>
        setSummary(getOfflineSyncSummary(scope)),
      );
    };
    refreshSummary();
    const unsubscribe = subscribeOfflineMutations(refreshSummary);

    const sync = () => {
      setOnline(navigator.onLine);
      void clearPrivateNavigationCaches({ includeCurrent: false });
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

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      publishInstallAvailability({ available: true, ios: false });
    };

    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    const interval = window.setInterval(sync, 60_000);

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
  }, [publishInstallAvailability]);

  useEffect(() => {
    const install = async () => {
      if (installPrompt) {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
        publishInstallAvailability({
          available: iosInstallAvailable,
          ios: iosInstallAvailable,
        });
        return;
      }
      if (iosInstallAvailable) setShowIosInstructions(true);
    };

    const onInstallRequest = () => void install();
    const onAvailabilityRequest = () =>
      publishInstallAvailability({
        available: Boolean(installPrompt) || iosInstallAvailable,
        ios: !installPrompt && iosInstallAvailable,
      });

    window.addEventListener(INSTALL_REQUEST_EVENT, onInstallRequest);
    window.addEventListener(
      "profixiq:pwa-install-availability-request",
      onAvailabilityRequest,
    );
    return () => {
      window.removeEventListener(INSTALL_REQUEST_EVENT, onInstallRequest);
      window.removeEventListener(
        "profixiq:pwa-install-availability-request",
        onAvailabilityRequest,
      );
    };
  }, [installPrompt, iosInstallAvailable, publishInstallAvailability]);

  const activateUpdate = useCallback(() => {
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
      { once: true },
    );
    updateReady.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(reloadWhenControlled, 8_000);
  }, [activatingUpdate, updateReady]);

  useEffect(() => {
    publishRuntimeStatus();
  }, [publishRuntimeStatus]);

  useEffect(() => {
    const onStatusRequest = () => publishRuntimeStatus();
    const onUpdateRequest = () => activateUpdate();
    window.addEventListener(RUNTIME_STATUS_REQUEST_EVENT, onStatusRequest);
    window.addEventListener(UPDATE_REQUEST_EVENT, onUpdateRequest);
    return () => {
      window.removeEventListener(RUNTIME_STATUS_REQUEST_EVENT, onStatusRequest);
      window.removeEventListener(UPDATE_REQUEST_EVENT, onUpdateRequest);
    };
  }, [activateUpdate, publishRuntimeStatus]);

  const showRuntimeStatus =
    !online || pending > 0 || Boolean(updateReady) || Boolean(syncBlocked);

  const runtimeStatusControl = showRuntimeStatus && !mobileSurface ? (
    <div
      className={
        runtimeStatusTarget
          ? "flex w-full flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-slate-100 shadow-lg"
          : "fixed z-[100] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur sm:flex-nowrap sm:rounded-full"
      }
      style={
        runtimeStatusTarget
          ? undefined
          : {
              bottom: `calc(1rem + env(safe-area-inset-bottom, 0px) + ${viewportInsets.bottom}px)`,
              right: `calc(1rem + env(safe-area-inset-right, 0px) + ${viewportInsets.right}px)`,
            }
      }
    >
      {runtimeStatusTarget ? (
        <span className="w-full text-[10px] uppercase tracking-[0.16em] text-slate-400">
          App status
        </span>
      ) : null}
      <span
        className={`h-2 w-2 rounded-full ${
          online ? "bg-emerald-400" : "bg-amber-400"
        }`}
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
      {pending > 0 || !online || syncBlocked ? (
        <button
          type="button"
          onClick={() => window.location.assign("/offline/sync")}
          className="rounded-full border border-slate-600 px-3 py-1"
        >
          Details
        </button>
      ) : null}
      {updateReady ? (
        <button
          type="button"
          onClick={activateUpdate}
          disabled={activatingUpdate || pending > 0}
          className="rounded-full bg-sky-400 px-3 py-1 text-slate-950"
        >
          {activatingUpdate
            ? "Updating…"
            : pending > 0
              ? "Sync first"
              : "Update"}
        </button>
      ) : null}
    </div>
  ) : null;

  if (
    isStandalonePublicRoute(pathname) ||
    ((!showRuntimeStatus || mobileSurface) && !showIosInstructions)
  ) {
    return null;
  }

  return (
    <>
      {runtimeStatusControl && runtimeStatusTarget
        ? createPortal(runtimeStatusControl, runtimeStatusTarget)
        : runtimeStatusControl}

      {showIosInstructions && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left text-slate-100 shadow-2xl"
          >
            <h2 id="ios-install-title" className="text-lg font-semibold">
              Install ProFixIQ
            </h2>
            <ol className="mt-4 space-y-3 text-sm font-normal text-slate-300">
              <li>1. Open ProFixIQ in Safari.</li>
              <li>2. Tap the Share button.</li>
              <li>3. Choose Add to Home Screen, then tap Add.</li>
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
    </>
  );
}
