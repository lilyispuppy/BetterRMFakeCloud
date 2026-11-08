import { useEffect, useState } from "react";
import { apiBytes } from "../../api/client";
import { openPdf, type PdfDocument } from "./pdf";

export interface PdfState {
  doc: PdfDocument | undefined;
  error: unknown;
  loading: boolean;
}

/** Fetches a document as a PDF, annotations included, and opens it. */
export function usePdf(id: string): PdfState {
  const [state, setState] = useState<{ id: string; doc?: PdfDocument; error?: unknown } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let opened: PdfDocument | undefined;
    apiBytes(`documents/${id}`, { query: { type: "pdf" }, signal: controller.signal })
      .then((bytes) => openPdf(bytes))
      .then(
        (doc) => {
          if (controller.signal.aborted) return doc.destroy();
          opened = doc;
          setState({ id, doc });
        },
        (error: unknown) => !controller.signal.aborted && setState({ id, error }),
      );
    return () => {
      controller.abort();
      opened?.destroy();
    };
  }, [id]);

  const current = state?.id === id ? state : null;
  return { doc: current?.doc, error: current?.error, loading: current === null };
}
