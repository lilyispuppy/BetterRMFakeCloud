import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/ui";
import { sectionsFor } from "./sections";

function groups(sections: ReturnType<typeof sectionsFor>) {
  const out = new Map<string, typeof sections>();
  for (const s of sections) out.set(s.group, [...(out.get(s.group) ?? []), s]);
  return [...out.entries()];
}

export function SettingsLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const sections = sectionsFor(user);
  const atIndex = pathname.replace(/\/$/, "") === "/settings";

  return (
    <div className="mx-auto flex max-w-5xl gap-8">
      <nav aria-label="Settings" className="hidden w-52 shrink-0 flex-col gap-4 md:flex">
        {groups(sections).map(([group, items]) => (
          <div key={group} className="flex flex-col gap-1">
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">{group}</p>
            {items.map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center rounded-lg px-3 text-sm ${isActive ? "bg-accent/15 font-medium text-accent" : "hover:bg-line/50"}`
                }
              >
                {s.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {!atIndex && (
          <Link to="/settings" className="mb-3 inline-flex min-h-11 items-center text-sm text-accent md:hidden">
            ← Settings
          </Link>
        )}
        <Outlet />
      </div>
    </div>
  );
}

export function SettingsHome() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6">
        {groups(sectionsFor(user)).map(([group, items]) => (
          <section key={group} aria-label={group}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{group}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {items.map((s) => (
                <li key={s.to}>
                  <Link to={s.to} className="flex min-h-14 flex-col justify-center px-4 py-2 hover:bg-line/50">
                    <span className="font-medium">{s.label}</span>
                    <span className="text-sm text-muted">{s.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
