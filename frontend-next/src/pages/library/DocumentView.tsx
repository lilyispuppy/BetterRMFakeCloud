import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ApiError, api, apiUrl } from "../../api/client";
import type { DocumentTree, RmStat } from "../../api/types";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { Button, ErrorNote, Field, Loading, buttonClass } from "../../components/ui";
import { formatBytes, formatDate } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import { breadcrumbs, folderChoices, type Located } from "./tree";

type Tab = "info" | "pages" | "files";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Info({ stat }: { stat: RmStat }) {
  return (
    <dl className="divide-y divide-line">
      <Row label="Kind">{stat.fileType}</Row>
      <Row label="Version">{stat.version}</Row>
      <Row label="Starred">{stat.starred ? "Yes" : "No"}</Row>
      <Row label="Tags">{stat.tags?.length ? stat.tags.map((t) => <span key={t} className="mr-1 rounded bg-line px-2 py-0.5 text-sm">{t}</span>) : "None"}</Row>
      <Row label="Modified">{formatDate(stat.modifiedClient)}</Row>
      <Row label="Last opened">{formatDate(stat.lastOpened)}</Row>
      <Row label="Created">{formatDate(stat.createdTime)}</Row>
      {stat.content && (
        <>
          <Row label="Pages">{stat.content.pageCount}</Row>
          <Row label="Current page">{stat.currentPage + 1}</Row>
          <Row label="Orientation">{stat.content.orientation || "—"}</Row>
        </>
      )}
      <Row label="Stored size">{formatBytes(stat.totalSize)}</Row>
    </dl>
  );
}

function Pages({ stat }: { stat: RmStat }) {
  const pages = stat.pages ?? [];
  if (pages.length === 0) return <p className="py-4 text-muted">This document has no pages.</p>;
  return (
    <ul aria-label="Pages" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {pages.map((page, i) => {
        const src = apiUrl("rm/page", { id: stat.id, page: i });
        return (
          <li key={page.id} className="flex flex-col gap-1">
            <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line bg-white">
              <img src={src} alt={`Page ${i + 1}`} loading="lazy" className="aspect-[3/4] w-full object-contain" />
            </a>
            <span className="text-sm text-muted">
              Page {i + 1}
              {page.template ? ` · ${page.template}` : ""}
            </span>
            {page.tags?.map((t) => (
              <span key={t} className="w-fit rounded bg-line px-2 py-0.5 text-xs">
                {t}
              </span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

function Files({ stat }: { stat: RmStat }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-muted">
          <th className="py-2 pr-4 font-medium">File</th>
          <th className="py-2 text-right font-medium">Size</th>
        </tr>
      </thead>
      <tbody>
        {(stat.files ?? []).map((f) => (
          <tr key={f.name} className="border-b border-line/60">
            <td className="break-all py-2 pr-4 font-mono">{f.name}</td>
            <td className="py-2 text-right">{formatBytes(f.size)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DocumentView({
  tree,
  located,
  reload,
}: {
  tree: DocumentTree;
  located: Extract<Located, { kind: "document" }>;
  reload(): void;
}) {
  const { entry, parentId } = located;
  const navigate = useNavigate();
  const stat = useResource(`stat:${entry.id}`, (signal) => api<RmStat>("rm/stat", { query: { id: entry.id }, signal }));
  const [tab, setTab] = useState<Tab>("info");
  const [mode, setMode] = useState<"rename" | "move" | null>(null);
  const [name, setName] = useState(entry.name);
  const [target, setTarget] = useState(parentId);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const choices = folderChoices(tree);
  const back = parentId === "" ? "/library" : `/library/${parentId}`;

  async function attempt(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const update = (next: { name: string; parentId: string }) =>
    attempt(async () => {
      await api("documents", { method: "PUT", body: { documentId: entry.id, ...next } });
      setMode(null);
      reload();
    });

  function rename(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) void update({ name: name.trim(), parentId });
  }

  function remove() {
    if (!window.confirm(`Delete “${entry.name}”? This cannot be undone.`)) return;
    void attempt(async () => {
      await api(`documents/${entry.id}`, { method: "DELETE" });
      reload();
      navigate(back, { replace: true });
    });
  }

  const tabs: [Tab, string][] = [
    ["info", "Info"],
    ["pages", "Pages"],
    ["files", "Files"],
  ];
  const needsSync15 = stat.error instanceof ApiError && stat.error.status === 501;

  return (
    <div>
      <Breadcrumbs trail={breadcrumbs(tree, entry.id)} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="min-w-0 break-words text-2xl font-semibold">{entry.name}</h1>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass("primary")} href={apiUrl(`documents/${entry.id}`, { type: "pdf" })} download>
            Download PDF
          </a>
          <a className={buttonClass("secondary")} href={apiUrl(`documents/${entry.id}`, { type: "rmdoc" })} download>
            Download rmdoc
          </a>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setMode(mode === "rename" ? null : "rename")}>Rename</Button>
        <Button onClick={() => setMode(mode === "move" ? null : "move")}>Move</Button>
        <Button variant="danger" onClick={remove} disabled={busy}>
          Delete
        </Button>
      </div>

      {mode === "rename" && (
        <form onSubmit={rename} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field id="doc-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            Save
          </Button>
        </form>
      )}
      {mode === "move" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void update({ name: entry.name, parentId: target });
          }}
          className="mb-4 flex flex-wrap items-end gap-2"
        >
          <div className="flex min-w-48 flex-1 flex-col gap-1">
            <label htmlFor="doc-target" className="text-sm font-medium">
              Move to
            </label>
            <select id="doc-target" value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-3">
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={busy}>
            Move here
          </Button>
        </form>
      )}

      <div className="mb-3">
        <ErrorNote error={error} />
      </div>

      <div role="tablist" aria-label="Document details" className="mb-4 flex gap-1 border-b border-line">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-11 border-b-2 px-4 text-sm font-medium ${tab === id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {stat.loading && !stat.data ? (
          <Loading />
        ) : needsSync15 ? (
          <p className="py-4 text-muted">
            Details and page previews are not available: the explorer needs sync 1.5 and this account uses an older version. The downloads above still work.
          </p>
        ) : stat.error ? (
          <ErrorNote error={stat.error} />
        ) : stat.data ? (
          tab === "info" ? (
            <Info stat={stat.data} />
          ) : tab === "pages" ? (
            <Pages stat={stat.data} />
          ) : (
            <Files stat={stat.data} />
          )
        ) : null}
      </div>
    </div>
  );
}
