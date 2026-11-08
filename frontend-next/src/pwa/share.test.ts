// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { handleShare } from "./share";

function form(...files: [string, string][]) {
  const f = new FormData();
  for (const [name, type] of files) f.append("file", new File(["x"], name, { type }));
  return f;
}

describe("handleShare", () => {
  it("uploads the shared files to the top level of the library", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const to = await handleShare(form(["a.PDF", "application/pdf"], ["b.epub", "application/epub+zip"]), fetchMock);
    expect(to).toBe("/library?shared=2");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/ui/api/documents/upload");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    const body = init.body as FormData;
    expect(body.get("parent")).toBe("root");
    expect((body.getAll("file") as File[]).map((f) => f.name)).toEqual(["a.pdf", "b.epub"]);
  });

  it("says when the upload failed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    expect(await handleShare(form(["a.pdf", "application/pdf"]), fetchMock)).toBe("/library?shared=failed");
  });

  it("sends the person to sign in when the session has ended", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    expect(await handleShare(form(["a.pdf", "application/pdf"]), fetchMock)).toBe("/library?shared=signin");
  });

  it("says when the network is down", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));
    expect(await handleShare(form(["a.pdf", "application/pdf"]), fetchMock)).toBe("/library?shared=failed");
  });

  it("does nothing when no file was shared", async () => {
    const fetchMock = vi.fn();
    expect(await handleShare(new FormData(), fetchMock)).toBe("/library?shared=none");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
