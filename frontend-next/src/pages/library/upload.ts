import { ApiError, api } from "../../api/client";
import { lowerExtension } from "../../lib/files";

function body(parent: string, files: File[]): FormData {
  const form = new FormData();
  form.append("parent", parent || "root");
  for (const f of files) form.append("file", lowerExtension(f));
  return form;
}

/**
 * Uploads into a folder ("" is the top level). When the server says a document
 * with that name exists, `confirmOverwrite` decides whether it is replaced.
 */
export async function uploadFiles(
  parent: string,
  files: File[],
  confirmOverwrite: (message: string) => boolean,
): Promise<"uploaded" | "cancelled"> {
  try {
    await api("documents/upload", { method: "POST", body: body(parent, files) });
    return "uploaded";
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 409) throw e;
    const docId = (e.body as { docId?: string } | undefined)?.docId;
    if (!docId || !confirmOverwrite(`${e.message}\n\nReplace it?`)) return "cancelled";
    await api(`documents/${docId}`, { method: "DELETE" });
    await api("documents/upload", { method: "POST", body: body(parent, files) });
    return "uploaded";
  }
}
