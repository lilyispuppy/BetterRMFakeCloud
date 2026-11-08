import { registerSW } from "virtual:pwa-register";

/**
 * Registers the service worker. `onNeedRefresh` runs when a new version has been
 * downloaded and is waiting; the returned function activates it and reloads.
 */
export function registerServiceWorker(onNeedRefresh: () => void): () => Promise<void> {
  const update = registerSW({ onNeedRefresh, immediate: true });
  return () => update(true);
}
