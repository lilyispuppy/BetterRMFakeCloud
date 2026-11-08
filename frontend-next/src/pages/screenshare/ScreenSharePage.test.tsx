import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt, signIn } from "../../test/helpers";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signIn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tick = (ms = 2100) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("screen share", () => {
  it("waits for the tablet, and keeps asking whether it has started", async () => {
    let started = false;
    const api = mockApi({
      "GET screenshare/room": () => (started ? { roomId: "r1" } : new Response("", { status: 404 })),
      "GET screenshare/offer": { roomId: "r1", messages: [] },
    });
    renderAt("/screenshare");
    expect(screen.getByRole("heading", { level: 1, name: /screen share/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/waiting for your remarkable/i);
    await tick();
    await tick();
    expect(api.calls.filter((c) => c.key === "GET screenshare/room").length).toBeGreaterThanOrEqual(2);
    expect(api.calls.some((c) => c.key === "GET screenshare/offer")).toBe(false);
    started = true;
    await tick();
    expect(api.calls.some((c) => c.key === "GET screenshare/offer")).toBe(true);
  });

  it("says so when the tablet sent no offer, and lets you try again", async () => {
    const api = mockApi({
      "GET screenshare/room": {},
      "GET screenshare/offer": { roomId: "r1", messages: [] },
    });
    renderAt("/screenshare");
    await tick();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no offer/i);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByRole("status")).toHaveTextContent(/waiting/i);
    const before = api.calls.filter((c) => c.key === "GET screenshare/room").length;
    await tick();
    expect(api.calls.filter((c) => c.key === "GET screenshare/room").length).toBeGreaterThan(before);
  });

  it("says so when the server cannot give an offer", async () => {
    mockApi({
      "GET screenshare/room": {},
      "GET screenshare/offer": new Response(JSON.stringify({ error: "no room" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    });
    renderAt("/screenshare");
    await tick();
    expect(await screen.findByRole("alert")).toHaveTextContent("no room");
  });

  it("stops asking when you leave the page", async () => {
    const api = mockApi({ "GET screenshare/room": new Response("", { status: 404 }) });
    const { unmount } = renderAt("/screenshare");
    await tick();
    unmount();
    const count = api.calls.length;
    await tick(6000);
    expect(api.calls.length).toBe(count);
  });
});
