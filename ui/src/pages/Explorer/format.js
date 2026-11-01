// Small, pure helpers for the explorer.

export const isFolder = (node) => node.type === "CollectionType";

export function humanSize(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "";
  const units = ["B", "KiB", "MiB", "GiB"];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

// millis since the epoch, as the tablet stores them, to a readable date
export function formatMillis(ms) {
  const n = Number(ms);
  if (!ms || isNaN(n) || n <= 0) return "";
  return new Date(n).toLocaleString("sv");
}

// react-arborist treats a node with a children array as a folder, even when empty
export function toTreeData(nodes) {
  return (nodes || []).map((n) =>
    isFolder(n) ? { ...n, children: toTreeData(n.children) } : { ...n, children: undefined }
  );
}

export function collectTags(nodes, into = new Set()) {
  (nodes || []).forEach((n) => {
    (n.tags || []).forEach((t) => into.add(t));
    collectTags(n.children, into);
  });
  return [...into].sort((a, b) => a.localeCompare(b));
}

// Keeps nodes that match, and the folders needed to reach them.
// A folder that matches by itself keeps all of its content.
export function filterTree(nodes, { term = "", tag = "", starred = false }) {
  const needle = term.trim().toLowerCase();
  const matches = (n) =>
    (!needle || n.name.toLowerCase().includes(needle)) &&
    (!tag || (n.tags || []).includes(tag)) &&
    (!starred || n.starred);

  const walk = (list) =>
    list.flatMap((n) => {
      if (!isFolder(n)) return matches(n) ? [n] : [];
      const kids = walk(n.children || []);
      const selfMatches = matches(n) && (needle || tag || starred);
      if (selfMatches && !kids.length) return [{ ...n, children: n.children || [] }];
      return kids.length ? [{ ...n, children: kids }] : [];
    });
  return walk(nodes || []);
}

// ls output the way rmapi prints it: [d] for folders, [f] for documents
export function lsText(nodes) {
  if (!nodes.length) return "(empty)";
  return nodes.map((n) => `[${isFolder(n) ? "d" : "f"}]\t${n.name}`).join("\n");
}

export function findText(nodes) {
  if (!nodes.length) return "(no matches)";
  return nodes.map((n) => `[${isFolder(n) ? "d" : "f"}] ${n.path}`).join("\n");
}
