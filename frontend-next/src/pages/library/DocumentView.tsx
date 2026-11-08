import type { DocumentTree } from "../../api/types";
import type { Located } from "./tree";

export function DocumentView({ located }: { tree: DocumentTree; located: Extract<Located, { kind: "document" }>; reload(): void }) {
  return <h1 className="text-2xl font-semibold">{located.entry.name}</h1>;
}
