import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RmStat } from "../../api/types";
import { tree } from "../../test/fixtures";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stat: RmStat = {
  id: "d1",
  name: "Notes",
  type: "DocumentType",
  version: 7,
  modifiedClient: "2026-03-04T15:30:00Z",
  currentPage: 1,
  parent: "",
  tags: ["work"],
  starred: true,
  path: "/Notes",
  fileType: "notebook",
  createdTime: "2026-01-01T10:00:00Z",
  lastModified: "2026-03-04T15:30:00Z",
  lastOpened: "2026-03-05T09:00:00Z",
  files: [
    { name: "d1.metadata", size: 300 },
    { name: "p1.rm", size: 5000 },
  ],
  totalSize: 5300,
  content: { fileType: "notebook", formatVersion: 2, orientation: "portrait", pageCount: 2, lastOpenedPage: 1 },
  pages: [
    { id: "p1", index: 0, docPage: -1, tags: null },
    { id: "p2", index: 1, docPage: -1, template: "Blank", tags: ["todo"] },
  ],
};

function open(path = "/library/d1", extra: Record<string, unknown> = {}) {
  signIn();
  const api = mockApi({ "GET documents": tree, "GET rm/stat": stat, ...extra });
  renderAt(path);
  return api;
}

describe("a document", () => {
  it("shows its name and a way back to the folder it is in", async () => {
    open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" } });
    expect(await screen.findByRole("heading", { level: 1, name: "Form" })).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getAllByRole("link").map((a) => a.textContent)).toEqual(["Library", "Work", "Taxes"]);
  });

  it("offers the annotated PDF and the original archive for download", async () => {
    open();
    expect(await screen.findByRole("link", { name: /download pdf/i })).toHaveAttribute("href", "/ui/api/documents/d1?type=pdf");
    expect(screen.getByRole("link", { name: /download rmdoc/i })).toHaveAttribute("href", "/ui/api/documents/d1?type=rmdoc");
  });

  it("shows what is known about it on the Info tab", async () => {
    const api = open();
    expect(await screen.findByText("notebook")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(api.calls.find((c) => c.key === "GET rm/stat")?.url.searchParams.get("id")).toBe("d1");
  });

  it("shows a preview of every page, each opening full size", async () => {
    open();
    await userEvent.setup().click(await screen.findByRole("tab", { name: /pages/i }));
    const first = await screen.findByAltText("Page 1");
    expect(first).toHaveAttribute("src", "/ui/api/rm/page?id=d1&page=0");
    expect(first).toHaveAttribute("loading", "lazy");
    expect(screen.getByAltText("Page 2")).toHaveAttribute("src", "/ui/api/rm/page?id=d1&page=1");
    expect(first.closest("a")).toHaveAttribute("href", "/ui/api/rm/page?id=d1&page=0");
    expect(screen.getByText("todo")).toBeInTheDocument();
  });

  it("lists the files it is made of on the Files tab", async () => {
    open();
    await userEvent.setup().click(await screen.findByRole("tab", { name: /files/i }));
    expect(await screen.findByText("p1.rm")).toBeInTheDocument();
    expect(screen.getByText("4.9 KB")).toBeInTheDocument();
  });

  it("explains when the details need sync 1.5, and still offers the basics", async () => {
    open("/library/d1", {
      "GET rm/stat": new Response(JSON.stringify({ error: "The explorer needs sync 1.5." }), { status: 501, headers: { "Content-Type": "application/json" } }),
    });
    expect(await screen.findByText(/needs sync 1\.5/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download pdf/i })).toBeInTheDocument();
  });

  it("renames it, keeping it in the same folder", async () => {
    const api = open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" }, "PUT documents": {} });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^rename$/i }));
    const input = screen.getByLabelText(/name/i);
    await user.clear(input);
    await user.type(input, "Tax form");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT documents")).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.key === "PUT documents")?.init.body))).toEqual({
      documentId: "d3",
      name: "Tax form",
      parentId: "f2",
    });
  });

  it("moves it to another folder, keeping its name", async () => {
    const api = open("/library/d1", { "PUT documents": {} });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^move$/i }));
    await user.selectOptions(screen.getByLabelText(/move to/i), "Work / Taxes");
    await user.click(screen.getByRole("button", { name: /move here/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT documents")).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.key === "PUT documents")?.init.body))).toEqual({
      documentId: "d1",
      name: "Notes",
      parentId: "f2",
    });
  });

  it("moves it to the top level with an empty parent", async () => {
    const api = open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" }, "PUT documents": {} });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^move$/i }));
    await user.selectOptions(screen.getByLabelText(/move to/i), "Library");
    await user.click(screen.getByRole("button", { name: /move here/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT documents")).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.key === "PUT documents")?.init.body)).parentId).toBe("");
  });

  it("deletes it after asking, and goes back to its folder", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" }, "DELETE documents/d3": undefined });
    await userEvent.setup().click(await screen.findByRole("button", { name: /^delete$/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Form"));
    await waitFor(() => expect(api.calls.some((c) => c.key === "DELETE documents/d3")).toBe(true));
    expect(await screen.findByRole("heading", { level: 1, name: "Taxes" })).toBeInTheDocument();
  });

  it("does nothing when the delete is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = open();
    await userEvent.setup().click(await screen.findByRole("button", { name: /^delete$/i }));
    expect(api.calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
  });

  it("shows a failure from the server", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    open("/library/d1", { "DELETE documents/d1": new Response(JSON.stringify({ error: "nope" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    await userEvent.setup().click(await screen.findByRole("button", { name: /^delete$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});
