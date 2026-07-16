import {
  CacheFirst,
  ExpirationPlugin,
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
      matcher: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "profixiq-static-v1",
        plugins: [new ExpirationPlugin({ maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      matcher: ({ request, url }) =>
        url.origin === self.location.origin &&
        ["style", "script", "font", "image"].includes(request.destination),
      handler: new StaleWhileRevalidate({
        cacheName: "profixiq-assets-v1",
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 14 })],
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
