import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tree } from "../../test/fixtures";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => vi.unstubAllGlobals());

function open(path = "/library") {
  signIn();
  mockApi({ "GET documents": tree });
  renderAt(path);
}

async function toGrid() {
  await userEvent.click(await screen.findByRole("button", { name: /^grid$/i }));
  return screen.getByRole("list", { name: /items/i });
}

describe("the library as a grid", () => {
  it("starts as a list where the screen is small, and the choice is remembered", async () => {
    open();
    const list = await screen.findByRole("list", { name: /items/i });
    expect(list.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^list$/i })).toHaveAttribute("aria-pressed", "true");

    await toGrid();
    expect(localStorage.getItem("rmfc.next.libraryView")).toBe("grid");
  });

  it("starts as a grid when that was the last choice", async () => {
    localStorage.setItem("rmfc.next.libraryView", "grid");
    open();
    expect(await screen.findByRole("button", { name: /^grid$/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the first page of each document, named by its modification time so it can be kept", async () => {
    open();
    const grid = await toGrid();
    const cards = within(grid).getAllByRole("listitem");
    expect(cards).toHaveLength(3);

    const notes = within(cards[1]!).getByRole("link", { name: /notes/i });
    expect(notes).toHaveAttribute("href", "/library/d1");
    const picture = notes.querySelector("img")!;
    expect(picture.getAttribute("src")).toBe(`/ui/api/documents/d1/thumbnail?v=${Date.parse("2026-03-04T15:30:00Z")}`);
    expect(picture).toHaveAttribute("loading", "lazy");
  });

  it("draws folders as folders, with no picture to fetch", async () => {
    open();
    const grid = await toGrid();
    const work = within(grid).getByRole("link", { name: /work/i });
    expect(work).toHaveAttribute("href", "/library/f1");
    expect(work.querySelector("img")).toBeNull();
  });

  it("falls back to an icon when a picture cannot be had", async () => {
    open();
    const grid = await toGrid();
    const notes = within(grid).getByRole("link", { name: /notes/i });
    fireEvent.error(notes.querySelector("img")!);
    expect(notes.querySelector("img")).toBeNull();
    expect(within(notes).getByText("Notes")).toBeInTheDocument();
  });
});
