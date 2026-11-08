// A thin wrapper around pdf.js, loaded only when a document is opened. The
// rest of the app, and the tests, see only these small interfaces.

export interface PdfPageHandle {
  /** the size of the page in PDF points */
  width: number;
  height: number;
  /** Draws the page so that it is `cssWidth` CSS pixels wide, sharp on dense screens. */
  render(canvas: HTMLCanvasElement, cssWidth: number): { promise: Promise<void>; cancel(): void };
}

export interface PdfDocument {
  pageCount: number;
  getPage(number: number): Promise<PdfPageHandle>;
  destroy(): void;
}

// a very wide canvas is slow and can exceed what a phone allows
const MAX_CANVAS_PIXELS = 3200;

export async function openPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    destroy: () => void task.destroy(),
    async getPage(number) {
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      return {
        width: base.width,
        height: base.height,
        render(canvas, cssWidth) {
          const pixels = Math.min(cssWidth * (window.devicePixelRatio || 1), MAX_CANVAS_PIXELS);
          const viewport = page.getViewport({ scale: pixels / base.width });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const task = page.render({ canvas, viewport });
          return { promise: task.promise, cancel: () => task.cancel() };
        },
      };
    },
  };
}
