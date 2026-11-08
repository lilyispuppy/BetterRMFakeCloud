import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RmInfo, RmNode, RmStat } from "../../api/types";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => vi.unstubAllGlobals());

const node = (over: Partial<RmNode>): RmNode => ({
  id: "x",
  name: "x",
  type: "DocumentType",
  version: 1,
  modifiedClient: "",
  currentPage: 0,
  parent: "",
  tags: null,
  starred: false,
  path: "/x",
  ...over,
});

const root = node({
  id: "",
  name: "/",
  type: "CollectionType",
  path: "/",
  children: [
    node({ id: "f1", name: "Work", type: "CollectionType", path: "/Work", children: [node({ id: "d1", name: "Report", path: "/Work/Report", tags: ["q1"] })] }),
    node({ id: "d2", name: "Notes", path: "/Notes", starred: true }),
    node({ id: "trash", name: "trash", type: "CollectionType", path: "/trash", children: [] }),
  ],
});

const info: RmInfo = { generation: 42, rootHash: "abc123", schemaVersion: "4", documents: 2, folders: 1, trashed: 0, syncVersion: "1.5", userId: "ann" };
const stat = { ...node({ id: "d1", name: "Report", path: "/Work/Report" }), fileType: "pdf", createdTime: "", lastModified: "", lastOpened: "", files: [], totalSize: 10, pages: [], hash: "feedbeef", rawMetadata: { visibleName: "Report" }, rawContent: { fileType: "pdf" } } as RmStat;

function open(roles = ["User", "Dev"], extra: Record<string, unknown> = {}) {
  signIn(roles);
  const api = mockApi({ "GET rm/info": info, "GET rm/tree": root, "GET rm/stat": stat, ...extra });
  renderAt("/settings/developer/explorer");
  return api;
}

describe("explorer", () => {
  it("summarises what the server holds", async () => {
    open();
    expect(await screen.findByText(/generation/i)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("shows the folder tree, opening folders on request", async () => {
    open();
    const tree = await screen.findByRole("tree", { name: /documents/i });
    expect(within(tree).getByText("Notes")).toBeInTheDocument();
    expect(within(tree).queryByText("Report")).not.toBeInTheDocument();
    await userEvent.setup().click(within(tree).getByRole("button", { name: /work/i }));
    expect(within(tree).getByText("Report")).toBeInTheDocument();
  });

  it("shows the details of a document, with hashes and raw JSON to developers", async () => {
    const api = open();
    const user = userEvent.setup();
    const tree = await screen.findByRole("tree", { name: /documents/i });
    await user.click(within(tree).getByRole("button", { name: /work/i }));
    await user.click(within(tree).getByRole("button", { name: /report/i }));
    expect(await screen.findByText("feedbeef")).toBeInTheDocument();
    expect(screen.getByText(/"visibleName"/)).toBeInTheDocument();
    expect(api.calls.find((c) => c.key === "GET rm/stat")?.url.searchParams.get("id")).toBe("d1");
  });

  it("leaves hashes and raw JSON out when the server did", async () => {
    open(["User", "Dev"], { "GET rm/stat": { ...stat, hash: "", rawMetadata: undefined, rawContent: undefined }, "GET rm/info": { ...info, rootHash: "" } });
    const user = userEvent.setup();
    const tree = await screen.findByRole("tree", { name: /documents/i });
    await user.click(within(tree).getByRole("button", { name: /notes/i }));
    await screen.findByText("/Work/Report");
    expect(screen.queryByText(/raw metadata/i)).not.toBeInTheDocument();
  });

  it("finds documents by pattern, tag and star", async () => {
    const api = open(["User", "Dev"], { "GET rm/find": [node({ id: "d1", name: "Report", path: "/Work/Report" })] });
    const user = userEvent.setup();
    await screen.findByRole("tree", { name: /documents/i });
    await user.type(screen.getByLabelText(/pattern/i), "Rep");
    await user.type(screen.getByLabelText(/^tag/i), "q1");
    await user.click(screen.getByRole("checkbox", { name: /starred/i }));
    await user.click(screen.getByRole("button", { name: /^find$/i }));
    const results = await screen.findByRole("list", { name: /results/i });
    expect(within(results).getByText("/Work/Report")).toBeInTheDocument();
    const call = api.calls.find((c) => c.key === "GET rm/find");
    expect(call?.url.searchParams.get("pattern")).toBe("Rep");
    expect(call?.url.searchParams.getAll("tag")).toEqual(["q1"]);
    expect(call?.url.searchParams.get("starred")).toBe("true");
  });

  it("says when nothing was found", async () => {
    open(["User", "Dev"], { "GET rm/find": [] });
    const user = userEvent.setup();
    await screen.findByRole("tree", { name: /documents/i });
    await user.type(screen.getByLabelText(/pattern/i), "zzz");
    await user.click(screen.getByRole("button", { name: /^find$/i }));
    expect(await screen.findByText(/nothing found/i)).toBeInTheDocument();
  });

  it("explains that it needs sync 1.5", async () => {
    signIn(["User", "Dev"]);
    const unsupported = () => new Response(JSON.stringify({ error: "The explorer needs sync 1.5. Your account uses an older sync version." }), { status: 501, headers: { "Content-Type": "application/json" } });
    mockApi({ "GET rm/info": unsupported, "GET rm/tree": unsupported });
    renderAt("/settings/developer/explorer");
    await waitFor(() => expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/needs sync 1\.5/i));
  });
});
