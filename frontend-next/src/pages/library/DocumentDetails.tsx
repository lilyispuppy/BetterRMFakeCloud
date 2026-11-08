import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ApiError, api, apiUrl } from "../../api/client";
import type { DocumentEntry, DocumentTree, RmStat } from "../../api/types";
import { Button, ErrorNote, Field, Loading, buttonClass } from "../../components/ui";
import { formatBytes, formatDate } from "../../lib/format";
import { useResource } from "../../lib/useResource";
import { PageCanvas } from "./PageCanvas";
import type { PdfDocument } from "./pdf";
import { folderChoices } from "./tree";

type Tab = "info" | "pages" | "files";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-sm text-muted">{label}</dt>
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

function Pages({ doc, onGo }: { doc: PdfDocument | undefined; onGo(page: number): void }) {
  if (!doc) return <p className="py-4 text-muted">The pages are not available.</p>;
  return (
    <ul aria-label="Pages" className="grid grid-cols-2 gap-3">
      {Array.from({ length: doc.pageCount }, (_, i) => i + 1).map((n) => (
        <li key={n}>
          <button type="button" aria-label={`Go to page ${n}`} onClick={() => onGo(n)} className="flex w-full flex-col items-center gap-1 rounded-lg p-1 hover:bg-line/50">
            <PageCanvas doc={doc} number={n} width={140} ratio={4 / 3} label={`Preview of page ${n}`} />
            <span className="text-sm text-muted">{n}</span>
          </button>
        </li>
      ))}
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

/**
 * Everything about a document that is not the document: what it is made of,
 * its pages, and renaming, moving and deleting it. Opens beside the document
 * on a desktop and over it on a phone.
 */
export function DocumentDetails({
  tree,
  entry,
  parentId,
  doc,
  back,
  reload,
  onGo,
  onClose,
}: {
  tree: DocumentTree;
  entry: DocumentEntry;
  parentId: string;
  doc: PdfDocument | undefined;
  back: string;
  reload(): void;
  onGo(page: number): void;
  onClose(): void;
}) {
  const navigate = useNavigate();
  const stat = useResource(`stat:${entry.id}`, (signal) => api<RmStat>("rm/stat", { query: { id: entry.id }, signal }));
  const [tab, setTab] = useState<Tab>("info");
  const [mode, setMode] = useState<"rename" | "move" | null>(null);
  const [name, setName] = useState(entry.name);
  const [target, setTarget] = useState(parentId);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const escape = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      opener?.focus?.();
    };
    // opened once; onClose is a new function each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choices = folderChoices(tree);

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
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Document details"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-lg font-semibold">{entry.name}</h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close details" className={`${buttonClass("secondary")} shrink-0`}>
            Close
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => setMode(mode === "rename" ? null : "rename")}>Rename</Button>
          <Button onClick={() => setMode(mode === "move" ? null : "move")}>Move</Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            Delete
          </Button>
          <a className={buttonClass("secondary")} href={apiUrl(`documents/${entry.id}`, { type: "rmdoc" })} download>
            Download rmdoc
          </a>
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
          {tab === "pages" ? (
            <Pages doc={doc} onGo={onGo} />
          ) : stat.loading && !stat.data ? (
            <Loading />
          ) : needsSync15 ? (
            <p className="py-4 text-muted">Details are not available: the explorer needs sync 1.5 and this account uses an older version.</p>
          ) : stat.error ? (
            <ErrorNote error={stat.error} />
          ) : stat.data ? (
            tab === "info" ? (
              <Info stat={stat.data} />
            ) : (
              <Files stat={stat.data} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
