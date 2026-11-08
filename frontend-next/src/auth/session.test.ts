import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, hasRole, loadSession, parseToken, saveSession } from "./session";

function token(claims: object) {
  const enc = (o: object) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc(claims)}.sig`;
}

beforeEach(() => localStorage.clear());

describe("session", () => {
  it("reads the user out of the token the server issued", () => {
    const user = parseToken(token({ UserID: "ann", Email: "ann@example.com", Roles: ["Admin", "Dev"], exp: 4102444800 }));
    expect(user).toEqual({ id: "ann", email: "ann@example.com", roles: ["Admin", "Dev"], expires: 4102444800 });
  });

  it("copes with unicode and missing roles", () => {
    const user = parseToken(token({ UserID: "zoë", Email: "z@example.com" }));
    expect(user?.id).toBe("zoë");
    expect(user?.roles).toEqual([]);
  });

  it("rejects garbage", () => {
    expect(parseToken("nope")).toBeNull();
    expect(parseToken("a.b.c")).toBeNull();
  });

  it("stores and loads the user under its own key, apart from the legacy app", () => {
    const user = { id: "ann", email: "a@b.c", roles: ["User"], expires: 4102444800 };
    saveSession(user);
    expect(loadSession()).toEqual(user);
    expect(localStorage.getItem("currentUser")).toBeNull();
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("ignores an expired or corrupt stored session", () => {
    saveSession({ id: "a", email: "", roles: [], expires: 1 });
    expect(loadSession()).toBeNull();
    localStorage.setItem("rmfc.next.session", "{");
    expect(loadSession()).toBeNull();
  });

  it("answers role questions", () => {
    const user = { id: "a", email: "", roles: ["Admin"], expires: 0 };
    expect(hasRole(user, "Admin")).toBe(true);
    expect(hasRole(user, "Dev")).toBe(false);
    expect(hasRole(null, "Dev")).toBe(false);
  });
});
