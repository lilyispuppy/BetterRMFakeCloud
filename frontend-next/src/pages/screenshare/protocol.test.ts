import { zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { FrameAssembler, MSG, parseMessage, penCursorPosition, rotationDelta } from "./protocol";

function be32(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}
function be16(n: number) {
  return [(n >>> 8) & 255, n & 255];
}

/** one rect of 2x1 pixels: a pure red one and a pure blue one, in RGB565 little endian */
function frame(rects = 1): ArrayBuffer {
  const rect = [...be16(10), ...be16(20), ...be16(2), ...be16(1), ...be32(4), 0x00, 0xf8, 0x1f, 0x00];
  const raw = new Uint8Array(Array.from({ length: rects }, () => rect).flat());
  const deflated = zlibSync(raw);
  const out = new Uint8Array([MSG.FRAMEBUFFER, ...be16(rects), ...be32(deflated.length), ...deflated]);
  return out.buffer;
}

describe("parseMessage", () => {
  it("reads the handshake with the screen size", () => {
    const buf = new Uint8Array([MSG.HANDSHAKE, 0, 0, ...be16(954), ...be16(1696)]).buffer;
    expect(parseMessage(buf)).toEqual({ type: MSG.HANDSHAKE, width: 954, height: 1696 });
  });

  it("inflates a frame and turns RGB565 into RGBA", () => {
    const msg = parseMessage(frame());
    if (msg.type !== MSG.FRAMEBUFFER) throw new Error("wrong type");
    expect(msg.rects).toHaveLength(1);
    const r = msg.rects[0]!;
    expect([r.x, r.y, r.width, r.height]).toEqual([10, 20, 2, 1]);
    expect([...r.rgba]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it("stops at a rect that is cut short instead of reading past the end", () => {
    const msg = parseMessage(frame(1));
    if (msg.type !== MSG.FRAMEBUFFER) throw new Error("wrong type");
    expect(msg.rects).toHaveLength(1);
  });

  it("rejects a frame that claims more data than it has", () => {
    const bad = new Uint8Array([MSG.FRAMEBUFFER, ...be16(1), ...be32(9999), 1, 2, 3]).buffer;
    expect(() => parseMessage(bad)).toThrow(/exceeds/);
  });

  it("reads the cursor and the rotation", () => {
    expect(parseMessage(new Uint8Array([MSG.CURSOR, ...be16(300), ...be16(400)]).buffer)).toEqual({ type: MSG.CURSOR, x: 300, y: 400 });
    expect(parseMessage(new Uint8Array([MSG.ROTATION, ...be32(90)]).buffer)).toEqual({ type: MSG.ROTATION, degrees: 270 });
    expect(parseMessage(new Uint8Array([MSG.ROTATION, ...be32(0)]).buffer)).toEqual({ type: MSG.ROTATION, degrees: 0 });
  });

  it("knows shutdown and ping, and rejects what it does not know", () => {
    expect(parseMessage(new Uint8Array([MSG.SHUTDOWN]).buffer)).toEqual({ type: MSG.SHUTDOWN });
    expect(parseMessage(new Uint8Array([MSG.PING]).buffer)).toEqual({ type: MSG.PING });
    expect(() => parseMessage(new Uint8Array([77]).buffer)).toThrow(/unknown/);
    expect(() => parseMessage(new ArrayBuffer(0))).toThrow(/empty/);
  });
});

describe("FrameAssembler", () => {
  it("passes whole messages straight through", () => {
    const a = new FrameAssembler();
    const f = frame();
    expect(a.process(f)).toBe(f);
  });

  it("puts a frame back together from several messages", () => {
    const a = new FrameAssembler();
    const f = new Uint8Array(frame());
    const first = f.slice(0, 12).buffer;
    const second = f.slice(12, 20).buffer;
    const third = f.slice(20).buffer;
    expect(a.process(first)).toBeNull();
    expect(a.process(second)).toBeNull();
    const whole = a.process(third);
    expect(whole && new Uint8Array(whole)).toEqual(f);
  });

  it("passes other message types through while idle, and can be reset", () => {
    const a = new FrameAssembler();
    const ping = new Uint8Array([MSG.PING]).buffer;
    expect(a.process(ping)).toBe(ping);
    const f = new Uint8Array(frame());
    a.process(f.slice(0, 10).buffer);
    a.reset();
    expect(a.process(ping)).toBe(ping);
  });
});

describe("rotationDelta", () => {
  it.each([
    [0, 90, 90],
    [90, 0, -90],
    [0, 270, -90],
    [270, 0, 90],
    [0, 180, -180],
  ])("%d to %d turns %d", (a, b, d) => expect(rotationDelta(a, b)).toBe(d));
});

describe("penCursorPosition", () => {
  const rect = { left: 100, top: 50, width: 400, height: 800 };
  it("maps the screen centre to the middle of the canvas", () => {
    expect(penCursorPosition({ penX: 500, penY: 1000, canvasWidth: 1000, canvasHeight: 2000, rect, rotation: 0 })).toEqual({ x: 300, y: 450 });
  });
  it("scales from the screen size to what is drawn", () => {
    const pos = penCursorPosition({ penX: 0, penY: 1, canvasWidth: 1000, canvasHeight: 2000, rect, rotation: 0 });
    expect([Math.round(pos?.x ?? NaN), Math.round(pos?.y ?? NaN)]).toEqual([100, 50]);
  });
  it("turns with the canvas", () => {
    // rotated a quarter turn clockwise: the top left corner ends up top right
    const pos = penCursorPosition({ penX: 0, penY: 1, canvasWidth: 1000, canvasHeight: 2000, rect: { left: 0, top: 0, width: 800, height: 400 }, rotation: 90 });
    expect([Math.round(pos?.x ?? NaN) + 0, Math.round(pos?.y ?? NaN) + 0]).toEqual([800, 0]);
  });
  it("hides when the pen is at the origin", () => {
    expect(penCursorPosition({ penX: 0, penY: 0, canvasWidth: 10, canvasHeight: 10, rect, rotation: 0 })).toBeNull();
  });
});
