/** Caches that hold one person's documents. They must go when that person signs out. */
export const PRIVATE_CACHES = ["documents-list", "page-previews"];

export async function clearPrivateCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  await Promise.all(PRIVATE_CACHES.map((name) => caches.delete(name).catch(() => false)));
}
