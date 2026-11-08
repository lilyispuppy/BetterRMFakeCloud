import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api } from "../../api/client";
import { FrameAssembler, MSG, parseMessage, penCursorPosition, rotationDelta } from "./protocol";
import { answerBody, parseOffer, type SignalMessage } from "./signalling";

export type Status = "waiting" | "connecting" | "streaming" | "error";

interface IceServer {
  url?: string;
  urls?: string | string[];
  username?: string;
  credential?: string;
}

interface OfferResponse {
  roomId: string;
  iceServers?: IceServer[];
  messages?: SignalMessage[];
}

const POLL_MS = 2000;
const DISCONNECT = 0x65;

/**
 * Connects to the tablet's screen share and draws it on the canvas.
 *
 * The tablet starts a room on the server; this polls for it, takes the tablet's
 * offer, answers it, and then reads frames from the data channel the tablet
 * opens.
 */
export function useScreenShare(canvas: RefObject<HTMLCanvasElement | null>, pen: RefObject<HTMLDivElement | null>) {
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [disconnected, setDisconnected] = useState(false);

  const pc = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const rotationRef = useRef(0);
  const disconnectedRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  const cleanup = useCallback(() => {
    channel.current = null;
    pc.current?.close();
    pc.current = null;
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cleanup();
    };
  }, [cleanup]);

  const waitAgain = useCallback(() => {
    if (alive.current && !disconnectedRef.current) setStatus("waiting");
  }, []);

  const attach = useCallback(
    (dc: RTCDataChannel, connection: RTCPeerConnection) => {
      dc.binaryType = "arraybuffer";
      channel.current = dc;
      const assembler = new FrameAssembler();
      let width = 0;
      let height = 0;
      let context: CanvasRenderingContext2D | null = null;
      let penX = 0;
      let penY = 0;
      let tabletRotation = 0;

      const drawPen = () => {
        const el = canvas.current;
        const dot = pen.current;
        if (!el || !dot) return;
        const pos = penCursorPosition({
          penX,
          penY,
          canvasWidth: el.width,
          canvasHeight: el.height,
          rect: el.getBoundingClientRect(),
          rotation: rotationRef.current,
        });
        dot.style.display = pos ? "block" : "none";
        if (pos) {
          dot.style.left = `${pos.x - 4}px`;
          dot.style.top = `${pos.y - 4}px`;
        }
      };

      dc.onopen = () => {
        // the tablet waits for this greeting before it sends anything
        const hello = new TextEncoder().encode("reMarkable");
        const buf = new ArrayBuffer(hello.length + 2);
        new Uint8Array(buf).set(hello);
        dc.send(buf);
      };

      dc.onmessage = (e: MessageEvent<unknown>) => {
        if (!(e.data instanceof ArrayBuffer)) return;
        const whole = assembler.process(e.data);
        if (!whole) return;
        try {
          const msg = parseMessage(whole);
          const el = canvas.current;
          switch (msg.type) {
            case MSG.HANDSHAKE:
              width = msg.width;
              height = msg.height;
              if (el) {
                el.width = width;
                el.height = height;
                context = el.getContext("2d", { willReadFrequently: true });
              }
              setStatus("streaming");
              break;
            case MSG.FRAMEBUFFER:
              if (!context || !el) break;
              for (const r of msg.rects) {
                // a rect covering the screen is a resize
                if (r.x === 0 && r.y === 0 && r.width >= width * 0.9 && r.height >= height * 0.9) {
                  width = r.width;
                  height = r.height;
                  el.width = width;
                  el.height = height;
                }
                context.putImageData(new ImageData(r.rgba as Uint8ClampedArray<ArrayBuffer>, r.width, r.height), r.x, r.y);
              }
              break;
            case MSG.CURSOR:
              penX = msg.x;
              penY = msg.y;
              drawPen();
              break;
            case MSG.ROTATION:
              if (msg.degrees !== tabletRotation) {
                const delta = rotationDelta(tabletRotation, msg.degrees);
                tabletRotation = msg.degrees;
                setRotation((r) => r + delta);
              }
              break;
          }
        } catch (err) {
          console.error("[screenshare] message error:", err);
          assembler.reset();
        }
      };

      dc.onclose = waitAgain;

      // Candidates are not trickled: the tablet crashes on mDNS candidates, and
      // the answer already carries ours.
      connection.onicecandidate = () => {};
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
          cleanup();
          waitAgain();
        }
      };
    },
    [canvas, pen, cleanup, waitAgain],
  );

  const join = useCallback(async () => {
    try {
      setStatus("connecting");
      const data = await api<OfferResponse>("screenshare/offer");
      const offer = parseOffer(data.messages ?? []);
      if (!offer) throw new Error("No offer received from the device.");

      pc.current?.close();
      const config: RTCConfiguration = {};
      if (data.iceServers?.length) {
        config.iceServers = data.iceServers.map((s) => ({ urls: s.url || s.urls || [], username: s.username, credential: s.credential }));
      }
      const connection = new RTCPeerConnection(config);
      pc.current = connection;
      connection.ondatachannel = (ev) => attach(ev.channel, connection);

      await connection.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      for (const c of offer.candidates) await connection.addIceCandidate(c);
      await connection.setLocalDescription(await connection.createAnswer());

      // wait for ICE gathering so relay candidates are in the answer
      if (connection.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (connection.iceGatheringState === "complete") {
              connection.removeEventListener("icegatheringstatechange", check);
              resolve();
            }
          };
          connection.addEventListener("icegatheringstatechange", check);
          setTimeout(resolve, 5000);
        });
      }

      await api(`screenshare/room/${data.roomId}/answer`, {
        method: "POST",
        body: answerBody(offer.clientId, connection.localDescription?.sdp ?? ""),
      });
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [attach]);

  useEffect(() => {
    if (status !== "waiting") return;
    const timer = setInterval(() => {
      api("screenshare/room").then(
        () => {
          clearInterval(timer);
          if (alive.current) void join();
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, join]);

  const disconnect = useCallback(() => {
    if (channel.current?.readyState === "open") {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setInt32(0, DISCONNECT, false);
      channel.current.send(buf);
    }
    cleanup();
    disconnectedRef.current = true;
    setDisconnected(true);
    setError("Disconnected. Start a new screen share on the tablet to reconnect.");
    setStatus("error");
  }, [cleanup]);

  const retry = useCallback(() => {
    disconnectedRef.current = false;
    setDisconnected(false);
    setError(null);
    setStatus("waiting");
  }, []);

  const rotate = useCallback((degrees: number) => setRotation((r) => r + degrees), []);

  return { status, error, rotation, rotate, disconnect, retry, disconnected };
}
