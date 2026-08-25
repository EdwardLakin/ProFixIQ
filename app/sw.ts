import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

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

declare const self: {
  location: Location;
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

serwist.addEventListeners();
