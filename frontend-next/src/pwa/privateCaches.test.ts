import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_CACHES, clearPrivateCaches } from "./privateCaches";

afterEach(() => vi.unstubAllGlobals());

describe("clearPrivateCaches", () => {
  it("removes what was cached for the signed in person, and nothing else", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", { delete: (n: string) => Promise.resolve(deleted.push(n) > 0) });
    await clearPrivateCaches();
    expect(deleted.sort()).toEqual([...PRIVATE_CACHES].sort());
    expect(deleted).not.toContain("workbox-precache");
  });

  it("copes with browsers that have no cache storage", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });

  it("copes with a cache that cannot be deleted", async () => {
    vi.stubGlobal("caches", { delete: () => Promise.reject(new Error("no")) });
    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });
});
