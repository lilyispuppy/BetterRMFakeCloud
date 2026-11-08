import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, apiUrl, onUnauthorised } from "./client";

function reply(body: unknown, init: ResponseInit = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = typeof body === "string" ? {} : { "Content-Type": "application/json" };
  return new Response(text, { status: 200, headers, ...init });
}

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorised(null);
});

describe("api", () => {
  it("builds urls below /ui/api, with a query that leaves out empty values", () => {
    expect(apiUrl("documents")).toBe("/ui/api/documents");
    expect(apiUrl("rm/ls", { path: "/a b", empty: "", gone: undefined, n: 2 })).toBe(
      "/ui/api/rm/ls?path=%2Fa+b&n=2",
    );
    expect(apiUrl("rm/find", { tag: ["a", "b"] })).toBe("/ui/api/rm/find?tag=a&tag=b");
  });

  it("returns parsed JSON and sends the cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("documents")).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/ui/api/documents",
      expect.objectContaining({ credentials: "same-origin", method: "GET" }),
    );
  });

  it("sends JSON bodies with a content type, and form data as it is", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(reply({})));
    vi.stubGlobal("fetch", fetchMock);
    await api("login", { method: "POST", body: { email: "a" } });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe('{"email":"a"}');
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");

    const form = new FormData();
    await api("documents/upload", { method: "POST", body: form });
    const [, init2] = fetchMock.mock.calls[1]!;
    expect(init2?.body).toBe(form);
    expect(new Headers(init2?.headers).get("Content-Type")).toBeNull();
  });

  it("returns text when the reply is not JSON, and undefined when it is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply("token")).mockResolvedValueOnce(reply("")));
    await expect(api("login")).resolves.toBe("token");
    await expect(api("logout")).resolves.toBeUndefined();
  });

  it("throws an ApiError with the message the server gave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ error: "no such folder" }, { status: 400 })));
    const err = await api("folders").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: "no such folder" });
  });

  it("keeps the JSON body of an error for callers that need more than the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ error: "exists", docId: "d1" }, { status: 409 })));
    const err = (await api("documents/upload").catch((e: unknown) => e)) as ApiError;
    expect(err.body).toEqual({ error: "exists", docId: "d1" });
  });

  it("falls back to the status text, or a plain text body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 500, statusText: "Server Error" }))
        .mockResolvedValueOnce(new Response("bad things", { status: 400 })),
    );
    await expect(api("a")).rejects.toMatchObject({ status: 500, message: "Server Error" });
    await expect(api("b")).rejects.toMatchObject({ status: 400, message: "bad things" });
  });

  it("tells the app when the session has ended", async () => {
    const handler = vi.fn();
    onUnauthorised(handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(api("documents")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not treat a failed login as an ended session", async () => {
    const handler = vi.fn();
    onUnauthorised(handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(api("login", { method: "POST", body: {}, quiet401: true })).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });
});
