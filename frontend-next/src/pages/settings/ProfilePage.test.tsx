import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSession } from "../../auth/session";
import { mockApi, renderAt, signIn } from "../../test/helpers";

afterEach(() => vi.unstubAllGlobals());

async function fill(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/current password/i), current);
  await user.type(screen.getByLabelText(/^new password/i), next);
  await user.type(screen.getByLabelText(/confirm new password/i), confirm);
  await user.click(screen.getByRole("button", { name: /change password/i }));
}

describe("profile", () => {
  it("shows who is signed in", () => {
    signIn(["User"], "ann");
    mockApi({});
    renderAt("/settings/profile");
    expect(screen.getByText("ann@example.com")).toBeInTheDocument();
  });

  it("changes the password, then signs out so the new one is used", async () => {
    signIn(["User"], "ann");
    const api = mockApi({ "POST profile": undefined, "GET logout": undefined });
    renderAt("/settings/profile");
    await fill("old", "newpass1", "newpass1");
    await waitFor(() => expect(loadSession()).toBeNull());
    const post = api.calls.find((c) => c.key === "POST profile");
    expect(JSON.parse(String(post?.init.body))).toEqual({ userid: "ann", currentPassword: "old", newPassword: "newpass1", confirmNewPassword: "newpass1" });
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("will not send a confirmation that does not match", async () => {
    signIn();
    const api = mockApi({});
    renderAt("/settings/profile");
    await fill("old", "newpass1", "different");
    expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
    expect(api.calls).toHaveLength(0);
  });

  it("asks for every field", async () => {
    signIn();
    const api = mockApi({});
    renderAt("/settings/profile");
    await userEvent.setup().click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/required|enter/i);
    expect(api.calls).toHaveLength(0);
  });

  it("shows what the server says when the current password is wrong", async () => {
    signIn();
    mockApi({ "POST profile": new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    renderAt("/settings/profile");
    await fill("bad", "newpass1", "newpass1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(loadSession()).not.toBeNull();
  });
});
