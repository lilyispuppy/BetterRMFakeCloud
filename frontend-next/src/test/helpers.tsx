import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { App } from "../App";
import { saveSession } from "../auth/session";

export function signIn(roles: string[] = ["User"], id = "ann") {
  saveSession({ id, email: `${id}@example.com`, roles, expires: 4102444800 });
}

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

type Handler = unknown | ((url: URL, init: RequestInit) => unknown);

/**
 * Stubs fetch. Keys are "METHOD path" with the path below /ui/api, for example
 * "GET documents". A value is the JSON to reply with, or a function returning
 * it; a Response is passed through. Unknown requests fail the test loudly.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; url: URL; init: RequestInit }[] = [];
  const fn = vi.fn((input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname.replace(/^\/ui\/api\//, "")}`;
    calls.push({ key, url, init });
    if (!(key in routes)) {
      return Promise.resolve(new Response(JSON.stringify({ error: `unexpected ${key}` }), { status: 599 }));
    }
    const h = routes[key];
    const value = typeof h === "function" ? (h as (u: URL, i: RequestInit) => unknown)(url, init) : h;
    if (value instanceof Response) return Promise.resolve(value);
    if (typeof value === "string") return Promise.resolve(new Response(value));
    if (value === undefined) return Promise.resolve(new Response(null, { status: 200 }));
    return Promise.resolve(
      new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}
