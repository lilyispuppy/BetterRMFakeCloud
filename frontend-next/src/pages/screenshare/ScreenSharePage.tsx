import { useEffect, useRef, useState } from "react";
import { Button, PageHeader } from "../../components/ui";
import { useScreenShare } from "./useScreenShare";

const BACKDROPS: Record<string, string> = {
  white: "#ffffff",
  "off-white": "#f9f6f1",
  grey: "#2d2d2d",
  black: "#000000",
};
const STORE = "rmfc.next.screenshare.backdrop";

export function ScreenSharePage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pen = useRef<HTMLDivElement>(null);
  const { status, error, rotation, rotate, disconnect, retry } = useScreenShare(canvas, pen);
  const [full, setFull] = useState(false);
  const [backdrop, setBackdrop] = useState(() => localStorage.getItem(STORE) ?? "black");

  useEffect(() => {
    if (!full) return;
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [full]);

  const streaming = status === "streaming";
  const sideways = Math.abs(rotation % 180) === 90;
  const colour = BACKDROPS[backdrop] ?? backdrop;

  const canvasStyle = {
    transform: `rotate(${rotation}deg)`,
    transition: "transform 0.3s ease",
    ...(full
      ? sideways
        ? { maxWidth: "100vh", maxHeight: "100vw" }
        : { maxWidth: "100vw", maxHeight: "100vh" }
      : sideways
        ? { height: "min(70vh, 100%)", width: "auto" }
        : { width: "100%", maxWidth: "min(600px, 100%)" }),
  };

  return (
    <div>
      <PageHeader title="Screen share" />

      {status === "waiting" && (
        <p role="status" className="rounded-card border border-line bg-raised p-4 text-muted">
          Waiting for your reMarkable to start screen sharing…
        </p>
      )}
      {status === "connecting" && (
        <p role="status" className="rounded-card border border-line bg-raised p-4 text-muted">
          Connecting to your reMarkable…
        </p>
      )}
      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-raised p-4">
          <span>{error}</span>
          <Button onClick={retry}>Try again</Button>
        </div>
      )}

      <div
        className={full ? "fixed inset-0 z-50 flex items-center justify-center" : "flex flex-col items-center gap-3"}
        style={{ display: streaming ? undefined : "none", background: full ? colour : undefined }}
      >
        <canvas ref={canvas} aria-label="Your reMarkable's screen" className={full ? "bg-black" : "rounded bg-black"} style={canvasStyle} />
        <div ref={pen} aria-hidden="true" className="pointer-events-none fixed z-[60] size-2 rounded-full bg-red-600" style={{ display: "none" }} />

        <div className={full ? "fixed right-2 top-2 z-[70] flex flex-col gap-2 rounded-lg bg-black/70 p-2" : "flex flex-wrap items-center gap-2"}>
          <Button onClick={() => rotate(-90)} aria-label="Rotate left">
            ⟲
          </Button>
          <Button onClick={() => rotate(90)} aria-label="Rotate right">
            ⟳
          </Button>
          <Button onClick={() => setFull((f) => !f)}>{full ? "Exit full screen" : "Full screen"}</Button>
          <Button onClick={disconnect}>Disconnect</Button>
          {full && (
            <div className="flex gap-1" role="group" aria-label="Background">
              {Object.entries(BACKDROPS).map(([name, value]) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={`${name} background`}
                  aria-pressed={backdrop === name}
                  onClick={() => {
                    setBackdrop(name);
                    localStorage.setItem(STORE, name);
                  }}
                  className={`size-8 rounded border-2 ${backdrop === name ? "border-accent" : "border-line"}`}
                  style={{ background: value }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
