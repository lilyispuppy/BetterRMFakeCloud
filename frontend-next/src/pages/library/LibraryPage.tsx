import { useParams } from "react-router";
import { api } from "../../api/client";
import type { DocumentTree } from "../../api/types";
import { Button, ErrorNote, Loading } from "../../components/ui";
import { useResource } from "../../lib/useResource";
import { DocumentView } from "./DocumentView";
import { FolderView } from "./FolderView";
import { locate } from "./tree";

export function LibraryPage() {
  const { itemId } = useParams();
  const documents = useResource("documents", (signal) => api<DocumentTree>("documents", { signal }));

  if (documents.error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        <ErrorNote error={documents.error} />
        <Button onClick={documents.reload}>Try again</Button>
      </div>
    );
  }
  if (!documents.data) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Library</h1>
        <Loading />
      </>
    );
  }

  const tree = documents.data;
  const where = locate(tree, itemId);

  if (where.kind === "missing") {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold">Library</h1>
        <p className="text-muted">That item could not be found. It may have been moved or deleted.</p>
      </div>
    );
  }
  if (where.kind === "document") {
    return <DocumentView tree={tree} located={where} reload={documents.reload} />;
  }
  return <FolderView tree={tree} folderId={where.id} reload={documents.reload} />;
}
