import { useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { api } from "../../api/client";
import { isFolder, type DocumentTree, type Entry } from "../../api/types";
import { Button, ErrorNote, Field } from "../../components/ui";
import { formatBytes, formatDate } from "../../lib/format";
import { TRASH, breadcrumbs, childrenOf, search } from "./tree";
import { uploadFiles } from "./upload";

function Icon({ folder }: { folder: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 shrink-0 ${folder ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {folder ? (
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
      ) : (
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4" />
      )}
    </svg>
  );
}

function Row({ entry, where }: { entry: Entry; where?: string }) {
  const folder = isFolder(entry);
  return (
    <li>
      <Link to={`/library/${entry.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-line/50">
        <Icon folder={folder} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{entry.name}</span>
          <span className="block truncate text-sm text-muted">
            {where ?? (folder ? "Folder" : `${entry.type} · ${formatBytes(entry.size)}`)} · {formatDate(entry.lastModified)}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function FolderView({ tree, folderId, reload }: { tree: DocumentTree; folderId: string; reload(): void }) {
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const trail = breadcrumbs(tree, folderId);
  const inTrash = folderId === TRASH;
  const searching = query.trim() !== "";
  const results = search(tree, query);
  const entries = childrenOf(tree, folderId);

  async function run<T>(label: string, work: () => Promise<T>) {
    setBusy(label);
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const upload = (files: File[]) =>
    files.length > 0 &&
    run("Uploading", () => uploadFiles(folderId, files, (message) => window.confirm(message)));

  function drop(e: DragEvent) {
    e.preventDefault();
    if (!inTrash) void upload([...e.dataTransfer.files]);
  }

  function createFolder(e: FormEvent) {
    e.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    void run("Creating the folder", async () => {
      await api("folders", { method: "POST", body: { name, parentId: folderId } });
      setNaming(false);
      setFolderName("");
    });
  }

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          {trail.map((crumb, i) => (
            <li key={crumb.id} className="flex items-center gap-1">
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{trail.length === 1 ? "Library" : trail[trail.length - 1]?.name}</h1>
        {!inTrash && (
          <div className="flex gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-medium text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
              Upload files
              <input
                type="file"
                multiple
                accept=".pdf,.epub,.zip,.rmdoc,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  void upload([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </label>
            <Button onClick={() => setNaming((n) => !n)}>New folder</Button>
          </div>
        )}
      </div>

      {naming && (
        <form onSubmit={createFolder} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field id="folder-name" label="Folder name" value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus />
          </div>
          <Button type="submit" variant="primary" disabled={!folderName.trim() || busy !== null}>
            Create
          </Button>
        </form>
      )}

      <input
        type="search"
        aria-label="Search"
        placeholder="Search the library"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />

      {busy && (
        <p role="status" className="mb-3 text-sm text-muted">
          {busy}…
        </p>
      )}
      <div className="mb-3">
        <ErrorNote error={error} />
      </div>

      {searching ? (
        results.length === 0 ? (
          <p className="py-6 text-muted">No matches for “{query.trim()}”.</p>
        ) : (
          <ul aria-label="Results" className="divide-y divide-line overflow-hidden rounded-card border border-line">
            {results.map((r) => (
              <Row key={r.entry.id} entry={r.entry} where={r.where} />
            ))}
          </ul>
        )
      ) : entries.length === 0 ? (
        <p className="py-6 text-muted">{inTrash ? "The trash is empty." : "Nothing here yet. Upload a PDF to get started."}</p>
      ) : (
        <ul aria-label="Items" className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {entries.map((entry) => (
            <Row key={entry.id} entry={entry} />
          ))}
        </ul>
      )}

      {folderId === "" && !searching && (
        <Link to={`/library/${TRASH}`} className="mt-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
          Trash
        </Link>
      )}
    </div>
  );
}
