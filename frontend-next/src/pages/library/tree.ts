import { isFolder, type DocumentEntry, type DocumentTree, type Entry, type FolderEntry } from "../../api/types";

export const TRASH = "trash";

export type Located =
  | { kind: "folder"; id: string; name: string }
  | { kind: "document"; entry: DocumentEntry; parentId: string; trashed: boolean }
  | { kind: "missing" };

interface Hit {
  entry: Entry;
  /** names from the root down to the entry's parent */
  ancestors: { id: string; name: string }[];
  trashed: boolean;
}

function walk(entries: Entry[] | null, ancestors: Hit["ancestors"], trashed: boolean, visit: (h: Hit) => void) {
  for (const entry of entries ?? []) {
    visit({ entry, ancestors, trashed });
    if (isFolder(entry)) {
      walk(entry.children, [...ancestors, { id: entry.id, name: entry.name }], trashed, visit);
    }
  }
}

function everything(tree: DocumentTree): Hit[] {
  const hits: Hit[] = [];
  walk(tree.Entries, [{ id: "", name: "Library" }], false, (h) => hits.push(h));
  walk(tree.Trash, [{ id: "", name: "Library" }, { id: TRASH, name: "Trash" }], true, (h) => hits.push(h));
  return hits;
}

/** What an address in the library points at. */
export function locate(tree: DocumentTree, id: string | undefined): Located {
  if (!id) return { kind: "folder", id: "", name: "Library" };
  if (id === TRASH) return { kind: "folder", id: TRASH, name: "Trash" };
  const hit = everything(tree).find((h) => h.entry.id === id);
  if (!hit) return { kind: "missing" };
  if (isFolder(hit.entry)) return { kind: "folder", id: hit.entry.id, name: hit.entry.name };
  const parent = hit.ancestors[hit.ancestors.length - 1];
  return { kind: "document", entry: hit.entry, parentId: parent?.id ?? "", trashed: hit.trashed };
}

export function childrenOf(tree: DocumentTree, folderId: string): Entry[] {
  if (folderId === "") return tree.Entries ?? [];
  if (folderId === TRASH) return tree.Trash ?? [];
  const hit = everything(tree).find((h) => h.entry.id === folderId);
  return hit && isFolder(hit.entry) ? (hit.entry.children ?? []) : [];
}

/** The path to an item, starting with the library itself. */
export function breadcrumbs(tree: DocumentTree, id: string): { id: string; name: string }[] {
  const root = { id: "", name: "Library" };
  if (!id) return [root];
  if (id === TRASH) return [root, { id: TRASH, name: "Trash" }];
  const hit = everything(tree).find((h) => h.entry.id === id);
  return hit ? [...hit.ancestors, { id: hit.entry.id, name: hit.entry.name }] : [root];
}

export interface SearchResult {
  entry: Entry;
  where: string;
}

/** Case-insensitive name search across every folder, leaving the trash out. */
export function search(tree: DocumentTree, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return everything(tree)
    .filter((h) => !h.trashed && h.entry.name.toLowerCase().includes(q))
    .map((h) => ({ entry: h.entry, where: h.ancestors.map((a) => a.name).join(" / ") }));
}

export type { FolderEntry };

/** Every folder as a flat list with its path, for choosing where to move something. */
export function folderChoices(tree: DocumentTree): { id: string; label: string }[] {
  const out = [{ id: "", label: "Library" }];
  for (const h of everything(tree)) {
    if (!h.trashed && isFolder(h.entry)) {
      out.push({ id: h.entry.id, label: [...h.ancestors.slice(1).map((a) => a.name), h.entry.name].join(" / ") });
    }
  }
  return out;
}
