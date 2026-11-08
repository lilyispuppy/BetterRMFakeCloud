import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserSummary } from "../../api/types";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const users: UserSummary[] = [
  { userid: "root", email: "root@example.com", isAdmin: true, dev: true, sync15: true, integrationCount: 1, deviceCount: 2 },
  { userid: "bob", email: "bob@example.com", isAdmin: false, dev: false, sync15: false, integrationCount: 0, deviceCount: 0 },
];

function open(extra: Record<string, unknown> = {}) {
  signIn(["Admin"], "root");
  const api = mockApi({ "GET users": users, ...extra });
  renderAt("/settings/admin");
  return api;
}
const body = (api: ReturnType<typeof mockApi>, key: string) => JSON.parse(String(api.calls.find((c) => c.key === key)?.init.body));

describe("users", () => {
  it("lists them with their role and how many devices they have", async () => {
    open();
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]!).getByText("root@example.com")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Admin")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Dev")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/2 devices/i)).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("Admin")).not.toBeInTheDocument();
  });

  it("is only for admins", () => {
    signIn(["User"]);
    mockApi({});
    renderAt("/settings/admin");
    expect(screen.queryByRole("heading", { level: 1, name: /users/i })).not.toBeInTheDocument();
  });

  it("adds a user", async () => {
    const api = open({ "POST users": {} });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new user/i }));
    await user.type(screen.getByLabelText(/user id/i), "carol");
    await user.type(screen.getByLabelText(/^email/i), "carol@example.com");
    await user.type(screen.getByLabelText(/^password/i), "pw12345");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "POST users")).toBe(true));
    expect(body(api, "POST users")).toEqual({ userid: "carol", email: "carol@example.com", newpassword: "pw12345" });
    await waitFor(() => expect(api.calls.filter((c) => c.key === "GET users")).toHaveLength(2));
  });

  it("needs an id, an email and a password to add one", async () => {
    const api = open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new user/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/required/i);
    expect(api.calls.some((c) => c.key === "POST users")).toBe(false);
  });

  it("changes a user's email and developer access, leaving the password alone when empty", async () => {
    const api = open({ "PUT users": {} });
    const user = userEvent.setup();
    const rows = await screen.findAllByRole("listitem");
    await user.click(within(rows[1]!).getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/^email/i)).toHaveValue("bob@example.com");
    await user.click(screen.getByRole("checkbox", { name: /developer/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT users")).toBe(true));
    expect(body(api, "PUT users")).toEqual({ userid: "bob", email: "bob@example.com", newpassword: "", dev: true });
  });

  it("deletes a user after asking", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = open({ "DELETE users/bob": undefined });
    const rows = await screen.findAllByRole("listitem");
    await userEvent.setup().click(within(rows[1]!).getByRole("button", { name: /delete/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("bob"));
    await waitFor(() => expect(api.calls.some((c) => c.key === "DELETE users/bob")).toBe(true));
  });

  it("shows what the server says when it refuses", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    open({ "DELETE users/bob": new Response(JSON.stringify({ error: "cannot delete" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    const rows = await screen.findAllByRole("listitem");
    await userEvent.setup().click(within(rows[1]!).getByRole("button", { name: /delete/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot delete");
  });
});
