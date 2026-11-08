import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";

const item =
  "flex min-h-11 w-full items-center px-4 text-left text-sm hover:bg-line/50 focus-visible:bg-line/50 focus-visible:outline-none";

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const initial = (user?.email || user?.id || "?").charAt(0).toUpperCase();

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-11 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-card border border-line bg-surface shadow-lg"
        >
          <p className="truncate border-b border-line px-4 py-3 text-sm text-muted">{user?.email || user?.id}</p>
          <Link role="menuitem" to="/settings" className={item} onClick={() => setOpen(false)}>
            Settings
          </Link>
          <a role="menuitem" href="/legacy/" className={item}>
            Legacy app
          </a>
          <button
            role="menuitem"
            type="button"
            className={`${item} border-t border-line`}
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
