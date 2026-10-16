import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

import {
  parsePushEventPayload,
  PUSH_SUBSCRIPTION_CHANGED_MESSAGE,
} from "@/features/notifications/lib/pushClientContracts";
import {
  clearPrivateNavigationCaches,
  isSafePrivateNavigationShell,
  PRIVATE_NAVIGATION_CACHE_CLEAR_MESSAGE,
  PRIVATE_NAVIGATION_CACHE_NAMES,
} from "@/features/shared/lib/pwa/privateNavigationCache";

type ExtendableEventLike = Event & {
  waitUntil(promise: Promise<unknown>): void;
};

type MessageEventLike = ExtendableEventLike & {
  data: unknown;
};

type PushEventLike = ExtendableEventLike & {
  data: { text(): string } | null;
};

type NotificationClickEventLike = ExtendableEventLike & {
  notification: { close(): void; data?: unknown };
};

type WindowClientLike = {
  url: string;
  focus(): Promise<unknown>;
  navigate?(url: string): Promise<unknown>;
  postMessage(message: unknown): void;
};

declare const self: {
  location: Location;
  registration: {
    pushManager: {
      subscribe(options: PushSubscriptionOptionsInit): Promise<{ toJSON(): unknown }>;
    };
    showNotification(
      title: string,
      options: { body: string; tag?: string; data: unknown; icon: string; badge: string },
    ): Promise<void>;
  };
  clients: {
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: "push", listener: (event: PushEventLike) => void): void;
  addEventListener(
    type: "notificationclick",
    listener: (event: NotificationClickEventLike) => void,
  ): void;
  addEventListener(
    type: "pushsubscriptionchange",
    listener: (event: ExtendableEventLike) => void,
  ): void;
  __SW_MANIFEST: Array<string | { url: string; revision?: string | null }>;
  addEventListener(
    type: "activate",
    listener: (event: ExtendableEventLike) => void,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
};

const privateNavigationCachePlugin = {
  async cacheWillUpdate({
    response,
  }: {
    response: Response;
  }): Promise<Response | null> {
    return (await isSafePrivateNavigationShell(response)) ? response : null;
  },
  async cachedResponseWillBeUsed({
    cacheName,
    cachedResponse,
    request,
  }: {
    cacheName: string;
    cachedResponse?: Response;
    request: Request;
  }): Promise<Response | null> {
    if (!cachedResponse) return null;
    if (await isSafePrivateNavigationShell(cachedResponse)) {
      return cachedResponse;
    }
    await caches
      .open(cacheName)
      .then((cache) => cache.delete(request))
      .catch(() => false);
    return null;
  },
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        (url.pathname === "/portal/messages" || url.pathname === "/chat"),
      handler: new NetworkFirst({
        cacheName: PRIVATE_NAVIGATION_CACHE_NAMES.messaging,
        fetchOptions: { cache: "no-store" },
        networkTimeoutSeconds: 4,
        plugins: [
          privateNavigationCachePlugin,
          new ExpirationPlugin({
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 14,
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        (url.pathname === "/mobile/appointments" ||
          url.pathname === "/mobile/work-orders/create"),
      handler: new NetworkFirst({
        cacheName: PRIVATE_NAVIGATION_CACHE_NAMES.advisor,
        fetchOptions: { cache: "no-store" },
        networkTimeoutSeconds: 4,
        plugins: [
          privateNavigationCachePlugin,
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 * 14,
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" &&
        (url.pathname === "/mobile/tech/queue" ||
          url.pathname.startsWith("/mobile/work-orders/") ||
          url.pathname.startsWith("/mobile/jobs/")),
      handler: new NetworkFirst({
        cacheName: PRIVATE_NAVIGATION_CACHE_NAMES.technician,
        fetchOptions: { cache: "no-store" },
        networkTimeoutSeconds: 4,
        plugins: [
          privateNavigationCachePlugin,
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 60 * 60 * 24 * 14,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "profixiq-static-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 160,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        ["style", "script", "font", "image"].includes(request.destination),
      handler: new StaleWhileRevalidate({
        cacheName: "profixiq-assets-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 14,
          }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clearPrivateNavigationCaches({ includeCurrent: false }));
});

self.addEventListener("message", (event) => {
  const message =
    event.data && typeof event.data === "object"
      ? (event.data as { type?: unknown })
      : null;
  if (message?.type === PRIVATE_NAVIGATION_CACHE_CLEAR_MESSAGE) {
    event.waitUntil(clearPrivateNavigationCaches());
  }
});

// Web Push. Payloads are generic by contract (no job details on lock screens);
// the target page re-authorizes when opened.
self.addEventListener("push", (event) => {
  const payload = parsePushEventPayload(event.data ? event.data.text() : null);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.id ?? undefined,
      data: { path: payload.path },
      icon: "/pwa-icons/icon-192",
      badge: "/pwa-icons/icon-192",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { path?: unknown } | undefined;
  const target = parsePushEventPayload(JSON.stringify({ path: data?.path })).path;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        if (existing.navigate) {
          await existing.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // Preserve consent: re-subscribe from the worker (same-origin fetch carries the
  // session cookie), even when no window is open. Fall back to asking open pages.
  const change = event as ExtendableEventLike & {
    oldSubscription?: { options?: PushSubscriptionOptionsInit } | null;
    newSubscription?: { toJSON(): unknown } | null;
  };
  event.waitUntil(
    (async () => {
      try {
        let next = change.newSubscription ?? null;
        if (!next && change.oldSubscription?.options) {
          next = await self.registration.pushManager.subscribe(change.oldSubscription.options);
        }
        if (!next) throw new Error("no subscription");
        const response = await fetch("/api/notifications/push/subscription", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next.toJSON()),
        });
        if (!response.ok) throw new Error("register failed");
      } catch {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windows) {
          client.postMessage({ type: PUSH_SUBSCRIPTION_CHANGED_MESSAGE });
        }
      }
    })(),
  );
});

serwist.addEventListeners();
