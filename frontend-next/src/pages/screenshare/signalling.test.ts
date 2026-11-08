import { describe, expect, it } from "vitest";
import { answerBody, parseOffer } from "./signalling";

describe("parseOffer", () => {
  it("finds the offer and who sent it", () => {
    const offer = parseOffer([{ clientId: "tablet", payload: { type: "offer", sdp: "v=0" } }]);
    expect(offer).toEqual({ clientId: "tablet", sdp: "v=0", candidates: [] });
  });

  it("looks inside the webtrc wrapper, and accepts description as well as sdp", () => {
    const offer = parseOffer([{ clientId: "t", payload: { type: "webtrc", payload: { type: "offer", description: "v=1" } } }]);
    expect(offer?.sdp).toBe("v=1");
  });

  it("collects the candidates, defaulting the media id to 0", () => {
    const offer = parseOffer([
      { clientId: "t", payload: { type: "offer", sdp: "x" } },
      { payload: { type: "candidate", candidate: "a", mid: "audio" } },
      { payload: { type: "webtrc", payload: { type: "candidate", candidate: "b" } } },
    ]);
    expect(offer?.candidates).toEqual([
      { candidate: "a", sdpMid: "audio" },
      { candidate: "b", sdpMid: "0" },
    ]);
  });

  it("is null when there is no offer", () => {
    expect(parseOffer([])).toBeNull();
    expect(parseOffer([{ payload: { type: "candidate", candidate: "a" } }, {}])).toBeNull();
  });
});

describe("answerBody", () => {
  it("wraps the answer the way the tablet expects", () => {
    expect(answerBody("tablet", "v=0")).toEqual({
      targetClientId: "tablet",
      payload: { type: "webtrc", payload: { type: "answer", description: "v=0" } },
    });
  });
});
