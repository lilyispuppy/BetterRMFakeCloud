import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RmStat } from "../../api/types";
import { tree } from "../../test/fixtures";
import { mockApi, renderAt, signIn } from "../../test/helpers";
import type { PdfDocument } from "./pdf";

const rendered: { page: number; width: number }[] = [];
let openPdf: (data: ArrayBuffer) => Promise<PdfDocument>;

vi.mock("./pdf", () => ({ openPdf: (data: ArrayBuffer) => openPdf(data) }));

function fakePdf(pages = 3): PdfDocument {
  return {
    pageCount: pages,
    destroy: vi.fn(),
    getPage: (page) =>
      Promise.resolve({
        width: 600,
        height: 800,
        render: (_canvas, width) => {
          rendered.push({ page, width });
          return { promise: Promise.resolve(), cancel: vi.fn() };
        },
      }),
  };
}

const pdfBytes = () => new Response("%PDF-fake");

beforeEach(() => {
  rendered.length = 0;
  openPdf = () => Promise.resolve(fakePdf());
  Element.prototype.scrollIntoView = vi.fn();
});

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
  const api = mockApi({ "GET documents": tree, "GET rm/stat": stat, "GET documents/d1": pdfBytes, "GET documents/d3": pdfBytes, ...extra });
  renderAt(path);
  return api;
}

async function openDetails() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^details$/i }));
  return { user, dialog: await screen.findByRole("dialog", { name: /details/i }) };
}

describe("a document, first of all, is read", () => {
  it("fetches the PDF with its annotations merged in and shows every page", async () => {
    const api = open();
    const pages = await screen.findAllByRole("img", { name: /^page \d of 3$/i });
    expect(pages).toHaveLength(3);
    const fetched = api.calls.find((c) => c.key === "GET documents/d1");
    expect(fetched?.url.searchParams.get("type")).toBe("pdf");
    await waitFor(() => expect(rendered.map((r) => r.page).sort()).toEqual([1, 2, 3]));
  });

  it("shows the name and a way back to the folder it is in", async () => {
    open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" } });
    expect(await screen.findByRole("heading", { level: 1, name: "Form" })).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getAllByRole("link").map((a) => a.textContent)).toEqual(["Library", "Work", "Taxes"]);
  });

  it("says which page is showing", async () => {
    open();
    expect(await screen.findByText("1 / 3")).toBeInTheDocument();
  });

  it("zooms in and out and back to fitting the width", async () => {
    open();
    const user = userEvent.setup();
    await screen.findAllByRole("img", { name: /^page/i });
    const width = () => rendered[rendered.length - 1]!.width;
    await waitFor(() => expect(rendered.length).toBeGreaterThan(0));
    const fit = width();

    await user.click(screen.getByRole("button", { name: /zoom in/i }));
    await waitFor(() => expect(width()).toBeCloseTo(fit * 1.25));
    await user.click(screen.getByRole("button", { name: /zoom out/i }));
    await user.click(screen.getByRole("button", { name: /zoom out/i }));
    await waitFor(() => expect(width()).toBeCloseTo(fit * 0.75));
    await user.click(screen.getByRole("button", { name: /fit width/i }));
    await waitFor(() => expect(width()).toBeCloseTo(fit));
  });

  it("offers the annotated PDF for download without opening anything", async () => {
    open();
    expect(await screen.findByRole("link", { name: /download pdf/i })).toHaveAttribute("href", "/ui/api/documents/d1?type=pdf");
  });

  it("says when the PDF could not be made, and still offers the downloads", async () => {
    open("/library/d1", {
      "GET documents/d1": new Response(JSON.stringify({ error: "Unable to export the document: no pages" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to export/i);
    expect(screen.getByRole("link", { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^details$/i })).toBeInTheDocument();
  });

  it("says when the PDF could not be read", async () => {
    openPdf = () => Promise.reject(new Error("Invalid PDF structure."));
    open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid pdf/i);
  });

  it("keeps the details out of the way until they are asked for", async () => {
    const api = open();
    await screen.findAllByRole("img", { name: /^page/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.calls.some((c) => c.key === "GET rm/stat")).toBe(false);
  });
});

describe("the details of a document", () => {
  it("show what is known about it", async () => {
    const api = open();
    await openDetails();
    expect(await screen.findByText("notebook")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(api.calls.find((c) => c.key === "GET rm/stat")?.url.searchParams.get("id")).toBe("d1");
  });

  it("close again", async () => {
    open();
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("close with Escape", async () => {
    open();
    const { user } = await openDetails();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offer the original archive for download", async () => {
    open();
    const { dialog } = await openDetails();
    expect(within(dialog).getByRole("link", { name: /download rmdoc/i })).toHaveAttribute("href", "/ui/api/documents/d1?type=rmdoc");
  });

  it("list the pages, and a page takes you to it", async () => {
    open();
    const { user, dialog } = await openDetails();
    await user.click(within(dialog).getByRole("tab", { name: /pages/i }));
    const second = await within(dialog).findByRole("button", { name: /go to page 2/i });
    await user.click(second);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("list the files it is made of", async () => {
    open();
    const { user, dialog } = await openDetails();
    await user.click(within(dialog).getByRole("tab", { name: /files/i }));
    expect(await within(dialog).findByText("p1.rm")).toBeInTheDocument();
    expect(within(dialog).getByText("4.9 KB")).toBeInTheDocument();
  });

  it("explain when they need sync 1.5, while the document still opens", async () => {
    open("/library/d1", {
      "GET rm/stat": new Response(JSON.stringify({ error: "The explorer needs sync 1.5." }), { status: 501, headers: { "Content-Type": "application/json" } }),
    });
    await screen.findAllByRole("img", { name: /^page/i });
    const { dialog } = await openDetails();
    expect(await within(dialog).findByText(/needs sync 1\.5/i)).toBeInTheDocument();
  });

  it("rename it, keeping it in the same folder", async () => {
    const api = open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" }, "PUT documents": {} });
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /^rename$/i }));
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

  it("move it to another folder, keeping its name", async () => {
    const api = open("/library/d1", { "PUT documents": {} });
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /^move$/i }));
    await user.selectOptions(screen.getByLabelText(/move to/i), "Work / Taxes");
    await user.click(screen.getByRole("button", { name: /move here/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT documents")).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.key === "PUT documents")?.init.body))).toEqual({
      documentId: "d1",
      name: "Notes",
      parentId: "f2",
    });
  });

  it("move it to the top level with an empty parent", async () => {
    const api = open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" }, "PUT documents": {} });
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /^move$/i }));
    await user.selectOptions(screen.getByLabelText(/move to/i), "Library");
    await user.click(screen.getByRole("button", { name: /move here/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT documents")).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.key === "PUT documents")?.init.body)).parentId).toBe("");
  });

  it("delete it after asking, and go back to its folder", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = open("/library/d3", { "GET rm/stat": { ...stat, id: "d3", name: "Form" }, "DELETE documents/d3": undefined });
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Form"));
    await waitFor(() => expect(api.calls.some((c) => c.key === "DELETE documents/d3")).toBe(true));
    expect(await screen.findByRole("heading", { level: 1, name: "Taxes" })).toBeInTheDocument();
  });

  it("do nothing when the delete is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = open();
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(api.calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
  });

  it("show a failure from the server", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    open("/library/d1", { "DELETE documents/d1": new Response(JSON.stringify({ error: "nope" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    const { user } = await openDetails();
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  });
});
