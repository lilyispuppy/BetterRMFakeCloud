// Who is signed in. The server keeps the real session in a cookie; this is
// only the user details, taken from the token, so the app can draw itself
// without a round trip. It uses its own storage key, so it never touches the
// legacy app's.

export interface SessionUser {
  id: string;
  email: string;
  roles: string[];
  /** seconds since the epoch; 0 when unknown */
  expires: number;
}

const KEY = "rmfc.next.session";

export function parseToken(token: string): SessionUser | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      UserID?: string;
      Email?: string;
      Roles?: string[];
      exp?: number;
    };
    if (!claims.UserID) return null;
    return { id: claims.UserID, email: claims.Email ?? "", roles: claims.Roles ?? [], expires: claims.exp ?? 0 };
  } catch {
    return null;
  }
}

export function saveSession(user: SessionUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as SessionUser;
    if (user.expires && user.expires * 1000 < Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

export function hasRole(user: SessionUser | null, role: string): boolean {
  return !!user && user.roles.includes(role);
}
