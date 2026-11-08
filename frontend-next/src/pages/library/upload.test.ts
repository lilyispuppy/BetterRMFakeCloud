import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "../../test/helpers";
import { uploadFiles } from "./upload";

afterEach(() => vi.unstubAllGlobals());

const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });

describe("uploadFiles", () => {
  it("sends the files and the folder they go into", async () => {
    const api = mockApi({ "POST documents/upload": {} });
    await uploadFiles("f1", [pdf("a.pdf"), pdf("b.pdf")], () => true);
    const form = api.calls[0]?.init.body as FormData;
    expect(form.get("parent")).toBe("f1");
    expect((form.getAll("file") as File[]).map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
  });

  it("uses root for the top level, as the server expects", async () => {
    const api = mockApi({ "POST documents/upload": {} });
    await uploadFiles("", [pdf("a.pdf")], () => true);
    expect((api.calls[0]?.init.body as FormData).get("parent")).toBe("root");
  });

  it("lower-cases file extensions, which the server needs", async () => {
    const api = mockApi({ "POST documents/upload": {} });
    await uploadFiles("", [pdf("Scan.PDF")], () => true);
    expect(((api.calls[0]?.init.body as FormData).get("file") as File).name).toBe("Scan.pdf");
  });

  it("asks before replacing a document that already exists, and replaces it", async () => {
    let first = true;
    const api = mockApi({
      "POST documents/upload": () => {
        if (first) {
          first = false;
          return new Response(JSON.stringify({ error: "a.pdf exists", docId: "old1" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        return {};
      },
      "DELETE documents/old1": undefined,
    });
    const confirm = vi.fn(() => true);
    await expect(uploadFiles("", [pdf("a.pdf")], confirm)).resolves.toBe("uploaded");
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("a.pdf exists"));
    expect(api.calls.map((c) => c.key)).toEqual(["POST documents/upload", "DELETE documents/old1", "POST documents/upload"]);
  });

  it("stops when the person says not to replace", async () => {
    const api = mockApi({
      "POST documents/upload": new Response(JSON.stringify({ error: "exists", docId: "old1" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    });
    await expect(uploadFiles("", [pdf("a.pdf")], () => false)).resolves.toBe("cancelled");
    expect(api.calls).toHaveLength(1);
  });

  it("passes other errors on", async () => {
    mockApi({ "POST documents/upload": new Response(JSON.stringify({ error: "too big" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    await expect(uploadFiles("", [pdf("a.pdf")], () => true)).rejects.toThrow("too big");
  });
});
