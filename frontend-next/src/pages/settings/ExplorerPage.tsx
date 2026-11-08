import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import type { RmInfo, RmNode, RmStat } from "../../api/types";
import { Button, Card, ErrorNote, Field, Loading, PageHeader } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useResource } from "../../lib/useResource";

function Branch({ node, selected, onSelect, depth = 0 }: { node: RmNode; selected: string; onSelect(n: RmNode): void; depth?: number }) {
  const [open, setOpen] = useState(false);
  const folder = node.type === "CollectionType";
  const label = node.id === "trash" ? "Trash" : node.name;
  return (
    <li role="treeitem" aria-expanded={folder ? open : undefined} aria-selected={node.id === selected}>
      <button
        type="button"
        onClick={() => (folder ? setOpen((o) => !o) : onSelect(node))}
        style={{ paddingLeft: depth * 16 + 8 }}
        className={`flex min-h-11 w-full items-center gap-2 rounded pr-2 text-left text-sm hover:bg-line/50 ${node.id === selected ? "bg-accent/15 text-accent" : ""}`}
      >
        <span aria-hidden="true" className="w-4 text-muted">
          {folder ? (open ? "▾" : "▸") : ""}
        </span>
        <span className="truncate">{label}</span>
        {node.starred && <span aria-label="starred">★</span>}
      </button>
      {folder && open && (
        <ul role="group">
          {(node.children ?? []).map((c) => (
            <Branch key={c.id} node={c} selected={selected} onSelect={onSelect} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Detail({ id }: { id: string }) {
  const stat = useResource(`stat:${id}`, (signal) => api<RmStat>("rm/stat", { query: { id }, signal }));
  if (stat.error) return <ErrorNote error={stat.error} />;
  const s = stat.data;
  if (!s) return <Loading />;
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">{s.name}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Path</dt>
        <dd className="break-all">{s.path}</dd>
        <dt className="text-muted">ID</dt>
        <dd className="break-all font-mono">{s.id}</dd>
        <dt className="text-muted">Version</dt>
        <dd>{s.version}</dd>
        <dt className="text-muted">Modified</dt>
        <dd>{formatDate(s.modifiedClient)}</dd>
        {s.hash && (
          <>
            <dt className="text-muted">Hash</dt>
            <dd className="break-all font-mono">{s.hash}</dd>
          </>
        )}
      </dl>
      {s.rawMetadata != null && (
        <>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Raw metadata</h3>
          <pre className="overflow-x-auto rounded bg-surface p-2 text-xs">{JSON.stringify(s.rawMetadata, null, 2)}</pre>
        </>
      )}
      {s.rawContent != null && (
        <>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Raw content</h3>
          <pre className="overflow-x-auto rounded bg-surface p-2 text-xs">{JSON.stringify(s.rawContent, null, 2)}</pre>
        </>
      )}
    </Card>
  );
}

function Find() {
  const [pattern, setPattern] = useState("");
  const [tag, setTag] = useState("");
  const [starred, setStarred] = useState(false);
  const [results, setResults] = useState<RmNode[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResults(await api<RmNode[] | null>("rm/find", { query: { pattern, tag: tag.trim() ? tag.trim().split(/[\s,]+/) : undefined, starred: starred ? "true" : undefined } }).then((r) => r ?? []));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">Find</h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <Field id="find-pattern" label="Pattern (regular expression)" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        </div>
        <div className="min-w-32">
          <Field id="find-tag" label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={starred} onChange={(e) => setStarred(e.target.checked)} />
          Starred only
        </label>
        <Button type="submit" variant="primary">
          Find
        </Button>
      </form>
      <div className="mt-3">
        <ErrorNote error={error} />
        {results && results.length === 0 && <p className="text-sm text-muted">Nothing found.</p>}
        {results && results.length > 0 && (
          <ul aria-label="Results" className="divide-y divide-line text-sm">
            {results.map((r) => (
              <li key={r.id} className="break-all py-2">
                {r.path}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function ExplorerPage() {
  const info = useResource("rm-info", (signal) => api<RmInfo>("rm/info", { signal }));
  const tree = useResource("rm-tree", (signal) => api<RmNode>("rm/tree", { signal }));
  const [selected, setSelected] = useState<string>("");

  return (
    <>
      <PageHeader title="Explorer" />
      <p className="mb-4 max-w-prose text-sm text-muted">
        The data your tablet has synced, as the server holds it (sync 1.5). Browsing, page previews and downloads for everyday use are in the library.
      </p>

      {info.data && (
        <Card className="mb-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
            <dt className="text-muted">Generation</dt>
            <dd>{info.data.generation}</dd>
            <dt className="text-muted">Sync</dt>
            <dd>{info.data.syncVersion}</dd>
            <dt className="text-muted">Documents</dt>
            <dd>{info.data.documents}</dd>
            <dt className="text-muted">Folders</dt>
            <dd>{info.data.folders}</dd>
            <dt className="text-muted">In trash</dt>
            <dd>{info.data.trashed}</dd>
            {info.data.rootHash && (
              <>
                <dt className="text-muted">Root hash</dt>
                <dd className="break-all font-mono">{info.data.rootHash}</dd>
              </>
            )}
          </dl>
        </Card>
      )}

      {tree.error ? (
        <ErrorNote error={tree.error} />
      ) : (
        <>
          <Find />
          {!tree.data ? (
            <Loading />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <ul role="tree" aria-label="Documents" className="max-h-[70vh] overflow-y-auto rounded-card border border-line p-1">
                {(tree.data.children ?? []).map((n) => (
                  <Branch key={n.id} node={n} selected={selected} onSelect={(x) => setSelected(x.id)} />
                ))}
              </ul>
              {selected && <Detail key={selected} id={selected} />}
            </div>
          )}
        </>
      )}
    </>
  );
}
