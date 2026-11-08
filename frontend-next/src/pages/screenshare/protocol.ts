// The reMarkable's screen share wire format, as the tablet sends it over a
// WebRTC data channel.

import { unzlibSync } from "fflate";

export const MSG = {
  FRAMEBUFFER: 0,
  CURSOR: 100,
  SHUTDOWN: 101,
  ROTATION: 102,
  PING: 103,
  HANDSHAKE: 104,
} as const;

// Frame: [type(1), rectCount(2 BE), deflatedSize(4 BE), zlib...]
const HEADER_SIZE = 7;
// Rect, once inflated: [x(2), y(2), w(2), h(2), pixelDataLen(4), pixels...]
const RECT_HEADER_SIZE = 12;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** width * height * 4 bytes, ready for ImageData */
  rgba: Uint8ClampedArray;
}

export type Message =
  | { type: typeof MSG.HANDSHAKE; width: number; height: number }
  | { type: typeof MSG.FRAMEBUFFER; rects: Rect[] }
  | { type: typeof MSG.CURSOR; x: number; y: number }
  | { type: typeof MSG.ROTATION; degrees: number }
  | { type: typeof MSG.SHUTDOWN }
  | { type: typeof MSG.PING };

/** Puts together a frame the tablet split over several messages. Other messages pass through. */
export class FrameAssembler {
  private buffer: Uint8Array | null = null;
  private expected = 0;
  private received = 0;

  reset() {
    this.buffer = null;
    this.expected = 0;
    this.received = 0;
  }

  /** A complete message, or null while a frame is still arriving. */
  process(data: ArrayBuffer): ArrayBuffer | null {
    if (this.buffer) return this.append(data);
    if (data.byteLength < HEADER_SIZE) return data;
    const view = new DataView(data);
    if (view.getUint8(0) !== MSG.FRAMEBUFFER) return data;
    const total = HEADER_SIZE + view.getUint32(3, false);
    if (data.byteLength >= total) return data;
    this.expected = total;
    this.buffer = new Uint8Array(total);
    this.buffer.set(new Uint8Array(data), 0);
    this.received = data.byteLength;
    return null;
  }

  private append(data: ArrayBuffer): ArrayBuffer | null {
    const buffer = this.buffer;
    if (!buffer) return null;
    const chunk = new Uint8Array(data);
    const take = Math.min(chunk.byteLength, this.expected - this.received);
    buffer.set(chunk.subarray(0, take), this.received);
    this.received += take;
    if (this.received < this.expected) return null;
    const done = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    this.reset();
    return done;
  }
}

function decodeFrame(data: ArrayBuffer, view: DataView): Message {
  const rectCount = view.getUint16(1, false);
  const deflatedSize = view.getUint32(3, false);
  if (HEADER_SIZE + deflatedSize > data.byteLength) throw new Error("deflated size exceeds message buffer");
  const raw = unzlibSync(new Uint8Array(data, HEADER_SIZE, deflatedSize));
  const rv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  const rects: Rect[] = [];
  let pos = 0;
  for (let i = 0; i < rectCount; i++) {
    if (pos + RECT_HEADER_SIZE > raw.byteLength) break;
    const x = rv.getUint16(pos, false);
    const y = rv.getUint16(pos + 2, false);
    const width = rv.getUint16(pos + 4, false);
    const height = rv.getUint16(pos + 6, false);
    const length = rv.getUint32(pos + 8, false);
    if (pos + RECT_HEADER_SIZE + length > raw.byteLength) break;

    const pixels = new DataView(raw.buffer, raw.byteOffset + pos + RECT_HEADER_SIZE, length);
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      const v = pixels.getUint16(p * 2, true);
      const r5 = (v >> 11) & 0x1f;
      const g6 = (v >> 5) & 0x3f;
      const b5 = v & 0x1f;
      rgba[p * 4] = (r5 << 3) | (r5 >> 2);
      rgba[p * 4 + 1] = (g6 << 2) | (g6 >> 4);
      rgba[p * 4 + 2] = (b5 << 3) | (b5 >> 2);
      rgba[p * 4 + 3] = 255;
    }
    pos += RECT_HEADER_SIZE + length;
    rects.push({ x, y, width, height, rgba });
  }
  return { type: MSG.FRAMEBUFFER, rects };
}

export function parseMessage(data: ArrayBuffer): Message {
  if (data.byteLength < 1) throw new Error("empty message");
  const view = new DataView(data);
  const type = view.getUint8(0);
  switch (type) {
    case MSG.HANDSHAKE:
      if (data.byteLength < HEADER_SIZE) throw new Error("short handshake");
      return { type, width: view.getUint16(3, false), height: view.getUint16(5, false) };
    case MSG.FRAMEBUFFER:
      return decodeFrame(data, view);
    case MSG.CURSOR:
      return { type, x: view.getUint16(1, false), y: view.getUint16(3, false) };
    case MSG.ROTATION:
      return { type, degrees: (360 - view.getUint32(1, false)) % 360 };
    case MSG.SHUTDOWN:
    case MSG.PING:
      return { type };
    default:
      throw new Error(`unknown message type: ${type}`);
  }
}

/** The shortest turn from one rotation to another, in degrees. */
export function rotationDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Where on the page to draw the pen marker. `rect` is where the (possibly
 * turned) canvas is on the page; the pen is in screen pixels. Null when the pen
 * is not on the screen (the tablet reports 0, 0).
 */
export function penCursorPosition(args: {
  penX: number;
  penY: number;
  canvasWidth: number;
  canvasHeight: number;
  rect: { left: number; top: number; width: number; height: number };
  rotation: number;
}): { x: number; y: number } | null {
  const { penX, penY, canvasWidth, canvasHeight, rect, rotation } = args;
  if (penX === 0 && penY === 0) return null;
  const rot = ((rotation % 360) + 360) % 360;
  const sideways = rot === 90 || rot === 270;
  const renderedWidth = sideways ? rect.height : rect.width;
  const renderedHeight = sideways ? rect.width : rect.height;
  const cx = (penX - canvasWidth / 2) * (renderedWidth / canvasWidth);
  const cy = (penY - canvasHeight / 2) * (renderedHeight / canvasHeight);
  const rad = (rot * Math.PI) / 180;
  return {
    x: rect.left + rect.width / 2 + cx * Math.cos(rad) - cy * Math.sin(rad),
    y: rect.top + rect.height / 2 + cx * Math.sin(rad) + cy * Math.cos(rad),
  };
}
