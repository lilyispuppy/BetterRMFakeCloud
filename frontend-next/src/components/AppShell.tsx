import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { AccountMenu } from "./AccountMenu";

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
    </svg>
  );
}
function ScreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

const primary: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/library", label: "Library", icon: <LibraryIcon /> },
  { to: "/screenshare", label: "Screen share", icon: <ScreenIcon /> },
];

/** Sidebar on desktop, bottom tab bar on phones; account menu at the top right. */
export function AppShell() {
  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav aria-label="Primary" className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-raised p-3 md:flex">
        <p className="px-3 py-3 text-lg font-semibold">rmfakecloud</p>
        {primary.map((p) => (
          <NavLink
            key={p.to}
            to={p.to}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? "bg-accent/15 text-accent" : "hover:bg-line/50"}`
            }
          >
            {p.icon}
            {p.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-2 md:justify-end">
          <p className="text-lg font-semibold md:hidden">rmfakecloud</p>
          <AccountMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
        <nav aria-label="Primary" className="grid grid-cols-2 border-t border-line bg-raised md:hidden">
          {primary.map((p) => (
            <NavLink
              key={p.to}
              to={p.to}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? "text-accent" : "text-muted"}`
              }
            >
              {p.icon}
              {p.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
