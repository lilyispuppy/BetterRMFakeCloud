// The offer and answer that set up the WebRTC connection go through the
// server as JSON messages, wrapped in a "webtrc" envelope.

interface Payload {
  type?: string;
  sdp?: string;
  description?: string;
  candidate?: string;
  mid?: string;
  payload?: Payload;
}

export interface SignalMessage {
  clientId?: string;
  payload?: Payload;
}

export interface Offer {
  clientId?: string;
  sdp: string;
  candidates: { candidate: string; sdpMid: string }[];
}

const unwrap = (p: Payload | undefined): Payload | undefined => (p && p.type === "webtrc" && p.payload ? p.payload : p);

export function parseOffer(messages: SignalMessage[]): Offer | null {
  let offer: Offer | null = null;
  const candidates: Offer["candidates"] = [];
  for (const m of messages) {
    const inner = unwrap(m.payload);
    if (!inner) continue;
    if (inner.type === "offer" && !offer) {
      offer = { clientId: m.clientId, sdp: inner.description || inner.sdp || "", candidates };
    } else if (inner.type === "candidate" && inner.candidate) {
      candidates.push({ candidate: inner.candidate, sdpMid: inner.mid || "0" });
    }
  }
  return offer;
}

export function answerBody(targetClientId: string | undefined, sdp: string) {
  return { targetClientId, payload: { type: "webtrc", payload: { type: "answer", description: sdp } } };
}
