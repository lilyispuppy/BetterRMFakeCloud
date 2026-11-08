import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tree } from "../test/fixtures";
import { mockApi, renderAt, signIn } from "../test/helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the app shell", () => {
  it("warns when the browser is offline", async () => {
    signIn();
    mockApi({ "GET documents": tree });
    renderAt("/library");
    await screen.findByRole("list", { name: /items/i });
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
  });

  it("offers to install the app once the browser allows it", async () => {
    signIn();
    mockApi({ "GET documents": tree });
    renderAt("/library");
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.queryByRole("menuitem", { name: /install app/i })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    const prompt = vi.fn().mockResolvedValue(undefined);
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    act(() => void window.dispatchEvent(offer));
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /install app/i }));
    expect(prompt).toHaveBeenCalled();
  });
});

describe("signing out", () => {
  it("clears the cached documents and previews", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: remove });
    signIn();
    mockApi({ "GET documents": tree, "GET logout": undefined });
    renderAt("/library");
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("documents-list"));
    expect(remove).toHaveBeenCalledWith("page-previews");
  });

  it("clears them as well when the server ends the session", async () => {
    const remove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: remove });
    signIn();
    mockApi({ "GET documents": new Response("no", { status: 401 }) });
    renderAt("/library");
    await waitFor(() => expect(remove).toHaveBeenCalledWith("documents-list"));
  });
});

describe("files shared to the app", () => {
  it.each([
    ["2", /2 files? added/i],
    ["1", /1 file added/i],
    ["failed", /could not be added/i],
    ["none", /no files/i],
  ])("says what happened when shared=%s", async (value, message) => {
    signIn();
    mockApi({ "GET documents": tree });
    renderAt(`/library?shared=${value}`);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("asks to sign in first when the session had ended", () => {
    mockApi({});
    renderAt("/library?shared=signin");
    expect(screen.getByText(/sign in to add the files/i)).toBeInTheDocument();
  });
});
