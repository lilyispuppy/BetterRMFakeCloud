import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt, signIn } from "../../test/helpers";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signIn(["User", "Dev"]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const entries = [
  { seq: 1, time: "2026-03-04T15:30:00Z", level: "info", message: "server started" },
  { seq: 2, time: "2026-03-04T15:31:00Z", level: "error", message: "something broke" },
];

describe("logs", () => {
  it("shows the log lines with their level", async () => {
    mockApi({ "GET logs": { entries, last: 2 } });
    renderAt("/settings/developer/logs");
    expect(await screen.findByText("server started")).toBeInTheDocument();
    expect(screen.getByText("something broke")).toBeInTheDocument();
    expect(screen.getAllByText("error").length).toBeGreaterThan(0);
  });

  it("asks only for what the filters say", async () => {
    const api = mockApi({ "GET logs": { entries, last: 2 } });
    renderAt("/settings/developer/logs");
    await screen.findByText("server started");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.selectOptions(screen.getByLabelText(/minimum level/i), "error");
    await waitFor(() => expect(api.calls.some((c) => c.url.searchParams.get("level") === "error")).toBe(true));
    await user.type(screen.getByRole("searchbox", { name: /search/i }), "broke");
    await waitFor(() => expect(api.calls.some((c) => c.url.searchParams.get("q") === "broke")).toBe(true));
  });

  it("follows new lines, asking only for those after the last one it has", async () => {
    let calls = 0;
    const api = mockApi({
      "GET logs": () => (++calls === 1 ? { entries, last: 2 } : { entries: [{ seq: 3, time: "2026-03-04T15:32:00Z", level: "warning", message: "a new line" }], last: 3 }),
    });
    renderAt("/settings/developer/logs");
    await screen.findByText("server started");
    await act(() => vi.advanceTimersByTimeAsync(3100));
    expect(await screen.findByText("a new line")).toBeInTheDocument();
    expect(screen.getByText("server started")).toBeInTheDocument();
    expect(api.calls[1]?.url.searchParams.get("since")).toBe("2");
  });

  it("can stop following", async () => {
    const api = mockApi({ "GET logs": { entries, last: 2 } });
    renderAt("/settings/developer/logs");
    await screen.findByText("server started");
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole("checkbox", { name: /follow/i }));
    const before = api.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(7000));
    expect(api.calls.length).toBe(before);
  });

  it("explains when developer features are off", async () => {
    mockApi({ "GET logs": new Response("", { status: 403 }) });
    renderAt("/settings/developer/logs");
    expect(await screen.findByRole("alert")).toHaveTextContent(/dev features are not enabled/i);
  });

  it("keeps people without the developer flag out", () => {
    localStorage.clear();
    signIn();
    mockApi({});
    renderAt("/settings/developer/logs");
    expect(screen.queryByRole("heading", { level: 1, name: /logs/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /settings/i })).toBeInTheDocument();
  });
});
