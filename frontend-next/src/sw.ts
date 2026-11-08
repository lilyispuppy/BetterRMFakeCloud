/// <reference lib="webworker" />
// The service worker: keeps the app shell available offline, caches page
// previews and the document list for a flaky connection, and takes files shared
// to the app. Everything else, in particular sign in and every change to data,
// goes straight to the network.

import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { handleShare } from "./pwa/share";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// every address in the app gets the shell, except the legacy app, the API and files
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/legacy(\/|$)/, /^\/api(\/|$)/, /^\/ui\/api(\/|$)/, /^\/share-target/, /\.[a-z0-9]+$/i],
  }),
);

const ok = new CacheableResponsePlugin({ statuses: [200] });

// page previews change rarely and are slow to draw
registerRoute(
  ({ url }) => url.pathname === "/ui/api/rm/page",
  new StaleWhileRevalidate({
    cacheName: "page-previews",
    plugins: [ok, new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 })],
  }),
);

// the document list: fresh when online, the last one seen when not
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname === "/ui/api/documents",
  new NetworkFirst({ cacheName: "documents-list", networkTimeoutSeconds: 4, plugins: [ok] }),
);

registerRoute(
  ({ url }) => url.pathname === "/share-target",
  async ({ request }) => Response.redirect(await handleShare(await request.formData()), 303),
  "POST",
);

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});
