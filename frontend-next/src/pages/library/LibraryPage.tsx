import { useParams, useSearchParams } from "react-router";
import { api } from "../../api/client";
import type { DocumentTree } from "../../api/types";
import { Button, ErrorNote, Loading } from "../../components/ui";
import { useResource } from "../../lib/useResource";
import { DocumentView } from "./DocumentView";
import { FolderView } from "./FolderView";
import { locate } from "./tree";

function sharedMessage(value: string | null): string | null {
  if (value === null) return null;
  if (value === "failed") return "The shared files could not be added. Try again.";
  if (value === "none") return "No files were shared.";
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) return null;
  return count === 1 ? "1 file added to your library." : `${count} files added to your library.`;
}

/** Files can be shared to the app from other apps; say what became of them. */
function SharedNotice() {
  const [params] = useSearchParams();
  const message = sharedMessage(params.get("shared"));
  if (!message) return null;
  return <p className="mb-4 rounded-card border border-line bg-raised px-4 py-3 text-sm">{message}</p>;
}

export function LibraryPage() {
  return (
    <>
      <SharedNotice />
      <LibraryContents />
    </>
  );
}

function LibraryContents() {
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
