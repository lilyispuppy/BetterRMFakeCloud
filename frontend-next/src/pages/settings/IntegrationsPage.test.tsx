import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const integrations = [
  { ID: "i1", Name: "Nextcloud", Provider: "webdav", Address: "https://cloud.example.com/dav", Username: "ann", Password: "pw" },
  { ID: "i2", Name: "Calendar", Provider: "ics", Address: "https://example.com/c.ics", Insecure: true },
];

function open(extra: Record<string, unknown> = {}) {
  signIn();
  const api = mockApi({ "GET integrations": integrations, ...extra });
  renderAt("/settings/integrations");
  return api;
}

const body = (api: ReturnType<typeof mockApi>, key: string) => JSON.parse(String(api.calls.find((c) => c.key === key)?.init.body));

describe("integrations", () => {
  it("lists them by name and kind", async () => {
    open();
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]!).getByText("Nextcloud")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/webdav/i)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/ics calendar/i)).toBeInTheDocument();
  });

  it("says when there are none", async () => {
    signIn();
    mockApi({ "GET integrations": [] });
    renderAt("/settings/integrations");
    expect(await screen.findByText(/no integrations/i)).toBeInTheDocument();
  });

  it("adds a WebDAV integration", async () => {
    const api = open({ "POST integrations": {} });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new integration/i }));
    await user.type(screen.getByLabelText(/^name/i), "Files");
    await user.selectOptions(screen.getByLabelText(/provider/i), "webdav");
    await user.type(screen.getByLabelText(/^address/i), "https://dav.example.com");
    await user.type(screen.getByLabelText(/^username/i), "ann");
    await user.type(screen.getByLabelText(/^password/i), "secret");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "POST integrations")).toBe(true));
    expect(body(api, "POST integrations")).toMatchObject({ name: "Files", provider: "webdav", address: "https://dav.example.com", username: "ann", password: "secret" });
    await waitFor(() => expect(api.calls.filter((c) => c.key === "GET integrations")).toHaveLength(2));
  });

  it.each([
    ["ftp", /^address/i, "ftp://host", "address"],
    ["ics", /ics url/i, "https://x/c.ics", "address"],
    ["dropbox", /access token/i, "tok", "accesstoken"],
    ["webhook", /endpoint/i, "https://hook", "endpoint"],
    ["localfs", /^path/i, "/data", "path"],
  ])("asks for what a %s integration needs", async (provider, label, value, field) => {
    const api = open({ "POST integrations": {} });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new integration/i }));
    await user.type(screen.getByLabelText(/^name/i), "X");
    await user.selectOptions(screen.getByLabelText(/provider/i), provider);
    await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "POST integrations")).toBe(true));
    expect(body(api, "POST integrations")).toMatchObject({ provider, [field]: value });
  });

  it("needs a name", async () => {
    const api = open();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /new integration/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/name/i);
    expect(api.calls.some((c) => c.key === "POST integrations")).toBe(false);
  });

  it("edits one, starting from what it has", async () => {
    const api = open({ "PUT integrations/i1": {} });
    const user = userEvent.setup();
    const rows = await screen.findAllByRole("listitem");
    await user.click(within(rows[0]!).getByRole("button", { name: /edit/i }));
    const name = screen.getByLabelText(/^name/i);
    expect(name).toHaveValue("Nextcloud");
    expect(screen.getByLabelText(/^address/i)).toHaveValue("https://cloud.example.com/dav");
    await user.clear(name);
    await user.type(name, "Cloud");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(api.calls.some((c) => c.key === "PUT integrations/i1")).toBe(true));
    expect(body(api, "PUT integrations/i1")).toMatchObject({ name: "Cloud", provider: "webdav", username: "ann", password: "pw" });
  });

  it("shows what the server says when it refuses", async () => {
    open({ "PUT integrations/i1": new Response(JSON.stringify({ error: "edit the file yourself" }), { status: 403, headers: { "Content-Type": "application/json" } }) });
    const user = userEvent.setup();
    const rows = await screen.findAllByRole("listitem");
    await user.click(within(rows[0]!).getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("edit the file yourself");
  });

  it("deletes one after asking", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = open({ "DELETE integrations/i2": undefined });
    const rows = await screen.findAllByRole("listitem");
    await userEvent.setup().click(within(rows[1]!).getByRole("button", { name: /delete/i }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Calendar"));
    await waitFor(() => expect(api.calls.some((c) => c.key === "DELETE integrations/i2")).toBe(true));
  });

  it("keeps it when the delete is not confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = open();
    const rows = await screen.findAllByRole("listitem");
    await userEvent.setup().click(within(rows[1]!).getByRole("button", { name: /delete/i }));
    expect(api.calls.some((c) => c.key.startsWith("DELETE"))).toBe(false);
  });
});
