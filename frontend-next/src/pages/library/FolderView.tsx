import { useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { api, apiUrl } from "../../api/client";
import { isFolder, type DocumentEntry, type DocumentTree, type Entry } from "../../api/types";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { Button, ErrorNote, Field } from "../../components/ui";
import { formatBytes, formatDate } from "../../lib/format";
import { TRASH, breadcrumbs, childrenOf, search } from "./tree";
import { uploadFiles } from "./upload";

function Icon({ folder, large }: { folder: boolean; large?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`${large ? "size-12" : "size-6"} shrink-0 ${folder ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {folder ? (
        <path d="M3 6a2 2 0 0 1 2-2h4.5l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      ) : (
        <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4" />
      )}
    </svg>
  );
}

type View = "grid" | "list";
const VIEW_KEY = "rmfc.next.libraryView";

/** The last choice, or a grid where there is room for one. */
function initialView(): View {
  const saved = localStorage.getItem(VIEW_KEY);
  if (saved === "grid" || saved === "list") return saved;
  return window.matchMedia?.("(min-width: 768px)").matches ? "grid" : "list";
}

function ViewToggle({ view, onChange }: { view: View; onChange(v: View): void }) {
  return (
    <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-lg border border-line">
      {(["grid", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`min-h-11 px-3 text-sm font-medium capitalize ${view === v ? "bg-accent/15 text-accent" : "text-muted hover:text-ink"}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/** The first page of a document. The modification time in the address lets the browser keep it for good. */
function Thumb({ entry }: { entry: DocumentEntry }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Icon folder={false} large />;
  return (
    <img
      src={apiUrl(`documents/${entry.id}/thumbnail`, { v: Date.parse(entry.lastModified) })}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-full object-cover object-top"
    />
  );
}

function Card({ entry }: { entry: Entry }) {
  const folder = isFolder(entry);
  return (
    <li>
      <Link to={`/library/${entry.id}`} className="group flex flex-col gap-2 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <span
          className={`flex aspect-[3/4] items-center justify-center overflow-hidden rounded-card border border-line ${folder ? "bg-accent/10" : "bg-white"} group-hover:border-accent`}
        >
          {folder ? <Icon folder large /> : <Thumb entry={entry} />}
        </span>
        <span className="min-w-0 px-1">
          <span className="block truncate text-sm font-medium">{entry.name}</span>
          <span className="block truncate text-xs text-muted">{folder ? "Folder" : formatDate(entry.lastModified)}</span>
        </span>
      </Link>
    </li>
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
  const [view, setView] = useState<View>(initialView);
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
      <Breadcrumbs trail={trail} />
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

      <div className="mb-4 flex gap-2">
        <input
          type="search"
          aria-label="Search"
          placeholder="Search the library"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <ViewToggle
          view={view}
          onChange={(v) => {
            setView(v);
            localStorage.setItem(VIEW_KEY, v);
          }}
        />
      </div>

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
      ) : view === "grid" ? (
        <ul aria-label="Items" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {entries.map((entry) => (
            <Card key={entry.id} entry={entry} />
          ))}
        </ul>
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
