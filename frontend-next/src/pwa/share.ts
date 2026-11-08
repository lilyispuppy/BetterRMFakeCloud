import { lowerExtension } from "../lib/files";

/**
 * Uploads what another app shared to this one, and says where to go next. The
 * service worker calls this when the share arrives, so it works before the app
 * has even opened.
 */
export async function handleShare(form: FormData, fetchImpl: typeof fetch = fetch): Promise<string> {
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return "/library?shared=none";

  const body = new FormData();
  body.append("parent", "root");
  for (const f of files) body.append("file", lowerExtension(f));

  try {
    const res = await fetchImpl("/ui/api/documents/upload", { method: "POST", body, credentials: "same-origin" });
    if (res.status === 401) return "/library?shared=signin";
    if (!res.ok) return "/library?shared=failed";
    return `/library?shared=${files.length}`;
  } catch {
    return "/library?shared=failed";
  }
}
