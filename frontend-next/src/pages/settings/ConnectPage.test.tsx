import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => vi.unstubAllGlobals());

describe("connect a device", () => {
  it("shows a one-time code to type on the tablet", async () => {
    signIn();
    mockApi({ "GET newcode": "abcdwxyz" });
    renderAt("/settings/devices/connect");
    expect(await screen.findByLabelText(/one-time code/i)).toHaveTextContent("abcdwxyz");
  });

  it("gets a fresh code on request", async () => {
    signIn();
    const codes = ["first111", "second22"];
    mockApi({ "GET newcode": () => codes.shift() });
    renderAt("/settings/devices/connect");
    await screen.findByText("first111");
    await userEvent.setup().click(screen.getByRole("button", { name: /new code/i }));
    expect(await screen.findByText("second22")).toBeInTheDocument();
  });

  it("explains where to type it", async () => {
    signIn();
    mockApi({ "GET newcode": "abcdwxyz" });
    renderAt("/settings/devices/connect");
    expect(await screen.findByText(/enter this code/i)).toBeInTheDocument();
  });

  it("shows an error", async () => {
    signIn();
    mockApi({ "GET newcode": new Response(JSON.stringify({ error: "no code for you" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    renderAt("/settings/devices/connect");
    expect(await screen.findByRole("alert")).toHaveTextContent("no code for you");
  });
});
