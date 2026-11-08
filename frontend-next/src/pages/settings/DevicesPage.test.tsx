import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Device } from "../../api/types";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => vi.unstubAllGlobals());

const devices: Device[] = [
  { id: "rm-1", description: "Pocket", firstSeen: "2026-01-01T10:00:00Z", lastSeen: "2026-03-04T15:30:00Z", syncVersion: "1.5", online: true, lastIP: "10.0.0.5", userAgent: "rmapi" },
  { id: "rm-2", userId: "bob", description: "", firstSeen: "2026-02-01T10:00:00Z", lastSeen: "2026-02-04T15:30:00Z", syncVersion: "1.0", online: false },
];

describe("devices", () => {
  it("lists devices with whether each is online", async () => {
    signIn();
    mockApi({ "GET devices": devices });
    renderAt("/settings/devices");
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]!).getByText("Pocket")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Online")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Offline")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/unnamed/i)).toBeInTheDocument();
  });

  it("keeps the developer details for developers", async () => {
    signIn();
    mockApi({ "GET devices": devices });
    renderAt("/settings/devices");
    await screen.findByText("Pocket");
    expect(screen.queryByText("10.0.0.5")).not.toBeInTheDocument();
  });

  it("shows IP address, user agent and ID to developers", async () => {
    signIn(["User", "Dev"]);
    mockApi({ "GET devices": devices });
    renderAt("/settings/devices");
    expect(await screen.findByText("10.0.0.5")).toBeInTheDocument();
    expect(screen.getByText("rmapi")).toBeInTheDocument();
    expect(screen.getByText("rm-1")).toBeInTheDocument();
  });

  it("lets an admin look at everyone's devices", async () => {
    signIn(["Admin"]);
    const api = mockApi({ "GET devices": devices });
    renderAt("/settings/devices");
    await screen.findByText("Pocket");
    await userEvent.setup().click(screen.getByRole("checkbox", { name: /all users/i }));
    await waitFor(() => expect(api.calls.some((c) => c.url.searchParams.get("all") === "1")).toBe(true));
    expect(await screen.findByText("bob")).toBeInTheDocument();
  });

  it("does not offer that to other people", async () => {
    signIn();
    mockApi({ "GET devices": devices });
    renderAt("/settings/devices");
    await screen.findByText("Pocket");
    expect(screen.queryByRole("checkbox", { name: /all users/i })).not.toBeInTheDocument();
  });

  it("explains when there are none, and points to connecting one", async () => {
    signIn();
    mockApi({ "GET devices": [] });
    renderAt("/settings/devices");
    expect(await screen.findByText(/no devices/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect a device/i })).toHaveAttribute("href", "/settings/devices/connect");
  });

  it("refreshes on request", async () => {
    signIn();
    const api = mockApi({ "GET devices": devices });
    renderAt("/settings/devices");
    await screen.findByText("Pocket");
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(api.calls.filter((c) => c.key === "GET devices")).toHaveLength(2));
  });

  it("shows an error", async () => {
    signIn();
    mockApi({ "GET devices": new Response("", { status: 500, statusText: "Server Error" }) });
    renderAt("/settings/devices");
    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });
});
