import type { DocumentTree } from "../api/types";

const d = (id: string, name: string, type = "notebook", size = 1000) => ({
  id,
  name,
  type,
  size,
  lastModified: "2026-03-04T15:30:00Z",
});
const f = (id: string, name: string, children: DocumentTree["Entries"]) => ({
  id,
  name,
  children,
  lastModified: "2026-03-01T10:00:00Z",
  isFolder: true as const,
});

/** Library / Work / Taxes / Form, plus Notes and Sketch at the top, and Old in the trash. */
export const tree: DocumentTree = {
  Entries: [
    f("f1", "Work", [f("f2", "Taxes", [d("d3", "Form", "pdf", 2048)])]),
    d("d1", "Notes"),
    d("d2", "Sketch"),
  ],
  Trash: [d("d9", "Old")],
};
