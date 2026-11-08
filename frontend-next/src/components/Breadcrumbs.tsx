import { Link } from "react-router";

export interface Crumb {
  id: string;
  name: string;
}

/** The path to the current item; every part but the last is a link. */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map((crumb, i) => (
          <li key={crumb.id || "root"} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i < trail.length - 1 ? (
              <Link to={crumb.id ? `/library/${crumb.id}` : "/library"} className="inline-flex min-h-8 items-center text-accent">
                {crumb.name}
              </Link>
            ) : (
              <span aria-current="page">{crumb.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
