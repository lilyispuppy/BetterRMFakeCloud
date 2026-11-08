import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt, signIn } from "../../test/helpers";
import { tree } from "../../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

function open(path: string, extra: Record<string, unknown> = {}) {
  signIn();
  const api = mockApi({ "GET documents": tree, ...extra });
  renderAt(path);
  return api;
}

describe("the library", () => {
  it("lists folders first, then documents, as links", async () => {
    open("/library");
    const list = await screen.findByRole("list", { name: /items/i });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByRole("link").textContent)).toEqual([
      expect.stringContaining("Work"),
      expect.stringContaining("Notes"),
      expect.stringContaining("Sketch"),
    ]);
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute("href", "/library/f1");
    expect(within(rows[1]!).getByRole("link")).toHaveAttribute("href", "/library/d1");
  });

  it("shows a folder's contents under a trail back to the top", async () => {
    open("/library/f2");
    expect(await screen.findByRole("link", { name: /^Form/ })).toBeInTheDocument();
    const trail = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(trail).getAllByRole("link").map((a) => a.textContent)).toEqual(["Library", "Work"]);
    expect(within(trail).getByText("Taxes")).toHaveAttribute("aria-current", "page");
  });

  it("says when there is nothing", async () => {
    signIn();
    mockApi({ "GET documents": { Entries: [], Trash: [] } });
    renderAt("/library");
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("searches every folder by name", async () => {
    open("/library");
    await screen.findByRole("list", { name: /items/i });
    await userEvent.setup().type(screen.getByRole("searchbox", { name: /search/i }), "form");
    const list = screen.getByRole("list", { name: /results/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText(/Library \/ Work \/ Taxes/)).toBeInTheDocument();
    await userEvent.setup().clear(screen.getByRole("searchbox", { name: /search/i }));
    expect(screen.getByRole("list", { name: /items/i })).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    open("/library");
    await screen.findByRole("list", { name: /items/i });
    await userEvent.setup().type(screen.getByRole("searchbox", { name: /search/i }), "zzz");
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("shows an error with a way to try again", async () => {
    signIn();
    let fail = true;
    mockApi({
      "GET documents": () => (fail ? new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "Content-Type": "application/json" } }) : tree),
    });
    renderAt("/library");
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("list", { name: /items/i })).toBeInTheDocument();
  });

  it("says when an item does not exist", async () => {
    open("/library/nope");
    expect(await screen.findByText(/could not be found/i)).toBeInTheDocument();
  });

  it("uploads into the folder being viewed, then refreshes", async () => {
    const api = open("/library/f1", { "POST documents/upload": {} });
    await screen.findByRole("list", { name: /items/i });
    const file = new File(["%PDF"], "New.pdf", { type: "application/pdf" });
    await userEvent.setup().upload(screen.getByLabelText(/upload files/i), file);
    await waitFor(() => expect(api.calls.filter((c) => c.key === "GET documents")).toHaveLength(2));
    const post = api.calls.find((c) => c.key === "POST documents/upload");
    expect((post?.init.body as FormData).get("parent")).toBe("f1");
  });

  it("makes a folder inside the current one", async () => {
    const api = open("/library/f1", { "POST folders": {} });
    await screen.findByRole("list", { name: /items/i });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.type(screen.getByLabelText(/folder name/i), "Receipts");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "POST folders")).toBe(true));
    const post = api.calls.find((c) => c.key === "POST folders");
    expect(JSON.parse(String(post?.init.body))).toEqual({ name: "Receipts", parentId: "f1" });
  });

  it("uses an empty parent for the top level", async () => {
    const api = open("/library", { "POST folders": {} });
    await screen.findByRole("list", { name: /items/i });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.type(screen.getByLabelText(/folder name/i), "Top");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "POST folders")).toBe(true));
    expect(JSON.parse(String(api.calls.find((c) => c.key === "POST folders")?.init.body))).toEqual({ name: "Top", parentId: "" });
  });

  it("does not offer to add things to the trash", async () => {
    open("/library/trash");
    expect(await screen.findByText("Old")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new folder/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/upload files/i)).not.toBeInTheDocument();
  });

  it("links to the trash from the top level", async () => {
    open("/library");
    expect(await screen.findByRole("link", { name: /trash/i })).toHaveAttribute("href", "/library/trash");
  });
});
