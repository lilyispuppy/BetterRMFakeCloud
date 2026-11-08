import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSession } from "./auth/session";
import { mockApi, renderAt, signIn } from "./test/helpers";

afterEach(() => vi.unstubAllGlobals());

describe("signed out", () => {
  it("sends every page to the login screen", () => {
    renderAt("/library");
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("signs in, remembers the user, and returns to the page that was asked for", async () => {
    const api = mockApi({
      "POST login": "eyJhbGciOiJIUzI1NiJ9.eyJVc2VySUQiOiJhbm4iLCJFbWFpbCI6ImFubkBleGFtcGxlLmNvbSIsIlJvbGVzIjpbIlVzZXIiXX0.sig",
      "GET documents": { Entries: [], Trash: [] },
    });
    renderAt("/settings");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "ann@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
    expect(loadSession()?.id).toBe("ann");
    const login = api.calls.find((c) => c.key === "POST login");
    expect(JSON.parse(String(login?.init.body))).toEqual({ email: "ann@example.com", password: "hunter2" });
  });

  it("says so when the sign in fails, and stays on the login screen", async () => {
    mockApi({ "POST login": new Response("", { status: 401, statusText: "Unauthorized" }) });
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "ann@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unauthorized|incorrect|wrong/i);
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("signed in", () => {
  it("opens on the library", () => {
    signIn();
    mockApi({ "GET documents": { Entries: [], Trash: [] } });
    renderAt("/");
    expect(screen.getByRole("heading", { name: /^library$/i })).toBeInTheDocument();
  });

  it("has Library and Screen share as the primary navigation", () => {
    signIn();
    mockApi({ "GET documents": { Entries: [], Trash: [] } });
    renderAt("/library");
    const nav = screen.getAllByRole("navigation", { name: /primary/i });
    expect(nav.length).toBeGreaterThan(0);
    for (const n of nav) {
      expect(within(n).getAllByRole("link").map((a) => a.textContent)).toEqual(["Library", "Screen share"]);
    }
  });

  it("marks the current section", () => {
    signIn();
    mockApi({});
    renderAt("/screenshare");
    const [nav] = screen.getAllByRole("navigation", { name: /primary/i });
    expect(within(nav!).getByRole("link", { name: "Screen share" })).toHaveAttribute("aria-current", "page");
    expect(within(nav!).getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Settings out of the primary navigation, in the account menu", async () => {
    signIn();
    mockApi({});
    renderAt("/screenshare");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /settings/i })).toHaveAttribute("href", "/settings");
    expect(within(menu).getByRole("menuitem", { name: /legacy app/i })).toHaveAttribute("href", "/legacy/");
    expect(within(menu).getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    expect(within(menu).getByText("ann@example.com")).toBeInTheDocument();
  });

  it("closes the menu with Escape", async () => {
    signIn();
    mockApi({});
    renderAt("/screenshare");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("signs out: tells the server, forgets the user, shows the login screen", async () => {
    signIn();
    const api = mockApi({ "GET logout": undefined });
    renderAt("/screenshare");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(loadSession()).toBeNull();
    expect(api.calls.some((c) => c.key === "GET logout")).toBe(true);
  });

  it("goes back to the login screen when the server ends the session", async () => {
    signIn();
    mockApi({ "GET documents": new Response("", { status: 401 }) });
    renderAt("/library");
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    await waitFor(() => expect(loadSession()).toBeNull());
  });

  it("says so when a route does not exist", () => {
    signIn();
    mockApi({});
    renderAt("/no/such/page");
    expect(screen.getByRole("heading", { name: /not found/i })).toBeInTheDocument();
  });

  it("has a main landmark", () => {
    signIn();
    mockApi({});
    renderAt("/screenshare");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

describe("links from the legacy app", () => {
  it.each([
    ["/documents", /^library$/i],
    ["/devices", /^devices$/i],
    ["/profile", /^profile$/i],
    ["/integrations", /^integrations$/i],
    ["/connect", /connect/i],
    ["/pair", /connect/i],
    ["/pair/app", /connect/i],
    ["/screenshare", /screen share/i],
  ])("%s opens the matching page", (path, heading) => {
    signIn(["Admin", "Dev"]);
    mockApi({ "GET documents": { Entries: [], Trash: [] }, "GET devices": [], "GET integrations": [] });
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });

  it.each([
    ["/explorer", /explorer/i],
    ["/logs", /logs/i],
    ["/admin", /users/i],
  ])("%s opens the matching developer or admin page", (path, heading) => {
    signIn(["Admin", "Dev"]);
    mockApi({ "GET users": [], "GET logs": { entries: [], next: 0 } });
    renderAt(path);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });
});
