import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare const self: {
  location: Location;
  __SW_MANIFEST: Array<string | { url: string; revision?: string | null }>;
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
        (url.pathname === "/mobile/appointments" ||
          url.pathname === "/mobile/work-orders/create"),
      handler: new NetworkFirst({
        cacheName: "profixiq-advisor-shell-v1",
        networkTimeoutSeconds: 4,
        plugins: [
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
        cacheName: "profixiq-technician-shell-v1",
        networkTimeoutSeconds: 4,
        plugins: [
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

serwist.addEventListeners();
