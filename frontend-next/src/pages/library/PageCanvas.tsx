import { useEffect, useRef, useState } from "react";
import type { PdfDocument, PdfPageHandle } from "./pdf";

/**
 * One page of a document. It takes its place on the screen at once, at the
 * proportions of the first page, and is only drawn when it comes near the
 * screen. Drawn again when its width changes.
 */
export function PageCanvas({
  doc,
  number,
  width,
  ratio,
  label,
}: {
  doc: PdfDocument;
  number: number;
  /** CSS pixels */
  width: number;
  /** height over width of the first page */
  ratio: number;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  const [page, setPage] = useState<PdfPageHandle | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (near || !el) return;
    const watcher = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "800px 0px" },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let live = true;
    doc.getPage(number).then(
      (p) => live && setPage(p),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [near, doc, number]);

  useEffect(() => {
    if (!page || !canvas.current || width <= 0) return;
    const task = page.render(canvas.current, width);
    task.promise.catch((e: unknown) => {
      // cancelling a drawing that is no longer wanted is not a failure
      if ((e as { name?: string })?.name !== "RenderingCancelledException") setFailed(true);
    });
    return () => task.cancel();
  }, [page, width]);

  const height = page ? (width * page.height) / page.width : width * ratio;
  return (
    <div ref={box} data-page={number} className="mx-auto mb-4 bg-white ring-1 ring-line" style={{ width, height }}>
      <canvas ref={canvas} role="img" aria-label={label ?? `Page ${number} of ${doc.pageCount}`} className="block size-full" />
      {failed && <p className="p-4 text-sm text-muted">This page could not be drawn.</p>}
    </div>
  );
}
