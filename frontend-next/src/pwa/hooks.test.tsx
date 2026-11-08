import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "./OfflineBanner";
import { UpdateToast } from "./UpdateToast";
import { useInstallPrompt } from "./useInstallPrompt";
import { useOnline } from "./useOnline";

afterEach(() => vi.restoreAllMocks());

function setOnline(online: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

describe("useOnline", () => {
  it("follows the browser's connection state", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => setOnline(false));
    expect(result.current).toBe(false);
    act(() => setOnline(true));
    expect(result.current).toBe(true);
  });
});

describe("OfflineBanner", () => {
  it("says so when offline and is gone when back online", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => setOnline(false));
    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
    act(() => setOnline(true));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("useInstallPrompt", () => {
  function promptEvent() {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = vi.fn().mockResolvedValue(undefined);
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    return e;
  }

  it("is unavailable until the browser offers to install", () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });

  it("keeps the browser's offer, and shows it when asked", async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const e = promptEvent();
    act(() => void window.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.canInstall).toBe(true);
    await act(() => result.current.install());
    expect(e.prompt).toHaveBeenCalled();
    expect(result.current.canInstall).toBe(false);
  });

  it("stops offering once the app is installed", () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => void window.dispatchEvent(promptEvent()));
    act(() => void window.dispatchEvent(new Event("appinstalled")));
    expect(result.current.canInstall).toBe(false);
  });
});

describe("UpdateToast", () => {
  it("offers a reload when a new version is ready", async () => {
    const update = vi.fn();
    render(<UpdateToast needRefresh onUpdate={update} onDismiss={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent(/new version/i);
    await userEvent.setup().click(screen.getByRole("button", { name: /reload/i }));
    expect(update).toHaveBeenCalled();
  });

  it("can be dismissed", async () => {
    const dismiss = vi.fn();
    render(<UpdateToast needRefresh onUpdate={() => undefined} onDismiss={dismiss} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /later/i }));
    expect(dismiss).toHaveBeenCalled();
  });

  it("shows nothing when there is nothing new", () => {
    render(<UpdateToast needRefresh={false} onUpdate={() => undefined} onDismiss={() => undefined} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
