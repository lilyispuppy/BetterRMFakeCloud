// The one place that talks to the server. Everything below /ui/api uses the
// session cookie, so requests only need to include credentials.

export const API_ROOT = "/ui/api";

export class ApiError extends Error {
  readonly status: number;
  /** the parsed JSON the server sent with the error, when there was any */
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue | QueryValue[]>;

export function apiUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== undefined && v !== null && v !== "") qs.append(key, String(v));
    }
  }
  const tail = qs.toString();
  return `${API_ROOT}/${path}${tail ? `?${tail}` : ""}`;
}

let unauthorised: (() => void) | null = null;

/** Registers what happens when the server says the session is over. */
export function onUnauthorised(fn: (() => void) | null) {
  unauthorised = fn;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** a 401 is an answer, not the end of the session (for example a wrong password) */
  quiet401?: boolean;
}

async function failure(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const parsed = JSON.parse(text) as { error?: string };
      return new ApiError(res.status, parsed.error || res.statusText || `Error ${res.status}`, parsed);
    } catch {
      return new ApiError(res.status, text);
    }
  }
  return new ApiError(res.status, res.statusText || `Error ${res.status}`);
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, quiet401 } = options;
  const headers = new Headers();
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const res = await fetch(apiUrl(path, query), { method, headers, body: payload, credentials: "same-origin", signal });

  if (!res.ok) {
    if (res.status === 401 && !quiet401) unauthorised?.();
    throw await failure(res);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  if (res.headers.get("Content-Type")?.startsWith("application/json")) return JSON.parse(text) as T;
  return text as T;
}
