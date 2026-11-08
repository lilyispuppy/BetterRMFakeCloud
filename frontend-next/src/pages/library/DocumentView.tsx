import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "../../api/client";
import type { DocumentTree } from "../../api/types";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { Button, ErrorNote, Loading, buttonClass } from "../../components/ui";
import { DocumentDetails } from "./DocumentDetails";
import { PageCanvas } from "./PageCanvas";
import { usePdf } from "./usePdf";
import { breadcrumbs, type Located } from "./tree";

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
// a page wider than this is hard to read across, however wide the screen
const FIT_MAX = 900;
const GUTTER = 32;

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FIT_MAX);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(() => el.clientWidth > 0 && setWidth(el.clientWidth));
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [ref]);
  return width;
}

/**
 * Opening a document shows the document: its pages, with what was written on
 * them merged in. Everything else (what it is made of, renaming, moving,
 * deleting) is behind Details.
 */
export function DocumentView({
  tree,
  located,
  reload,
}: {
  tree: DocumentTree;
  located: Extract<Located, { kind: "document" }>;
  reload(): void;
}) {
  const { entry, parentId } = located;
  const pdf = usePdf(entry.id);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [details, setDetails] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const available = useWidth(scroller);
  const [ratio, setRatio] = useState(4 / 3);

  const fit = Math.min(available - GUTTER, FIT_MAX);
  const width = Math.max(1, Math.round(fit * zoom));
  const back = parentId === "" ? "/library" : `/library/${parentId}`;

  // pages are laid out at the proportions of the first one until they are known
  useEffect(() => {
    let live = true;
    pdf.doc?.getPage(1).then((p) => live && setRatio(p.height / p.width), () => undefined);
    return () => {
      live = false;
    };
  }, [pdf.doc]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const middle = el.getBoundingClientRect().top + el.clientHeight / 2;
    for (const page of el.querySelectorAll<HTMLElement>("[data-page]")) {
      if (page.getBoundingClientRect().bottom >= middle) {
        setCurrent(Number(page.dataset.page));
        return;
      }
    }
  }, []);

  const go = useCallback((n: number) => {
    scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: "start" });
    setCurrent(n);
    setDetails(false);
  }, []);

  const zoomBy = (step: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + step) * 100) / 100)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Breadcrumbs trail={breadcrumbs(tree, entry.id)} />
      <div className="mb-2 flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold md:text-2xl">{entry.name}</h1>
        <Button variant="primary" onClick={() => setDetails(true)}>
          Details
        </Button>
      </div>
      <div className="mb-3 flex items-center gap-2">
        {pdf.doc && (
          <>
            <span aria-live="polite" className="px-1 text-sm text-muted">
              {current} / {pdf.doc.pageCount}
            </span>
            <div role="group" aria-label="Zoom" className="inline-flex gap-1">
              <Button aria-label="Zoom out" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} className="px-3">
                −
              </Button>
              <Button aria-label="Fit width" onClick={() => setZoom(1)} disabled={zoom === 1} className="px-3">
                Fit
              </Button>
              <Button aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} className="px-3">
                +
              </Button>
            </div>
          </>
        )}
        <a className={`${buttonClass("secondary")} ml-auto`} href={apiUrl(`documents/${entry.id}`, { type: "pdf" })} download aria-label="Download PDF">
          <span className="sm:hidden">PDF</span>
          <span className="hidden sm:inline">Download PDF</span>
        </a>
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto rounded-card border border-line bg-raised p-4">
        {pdf.error ? (
          <ErrorNote error={pdf.error} />
        ) : pdf.loading || !pdf.doc ? (
          <Loading label="Opening the document" />
        ) : (
          Array.from({ length: pdf.doc.pageCount }, (_, i) => i + 1).map((n) => (
            <PageCanvas key={n} doc={pdf.doc!} number={n} width={width} ratio={ratio} />
          ))
        )}
      </div>

      {details && (
        <DocumentDetails
          tree={tree}
          entry={entry}
          parentId={parentId}
          doc={pdf.doc}
          back={back}
          reload={reload}
          onGo={go}
          onClose={() => setDetails(false)}
        />
      )}
    </div>
  );
}
