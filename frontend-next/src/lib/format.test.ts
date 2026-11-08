import { describe, expect, it } from "vitest";
import { formatBytes, formatDate } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
    [3.2 * 1024 ** 3, "3.2 GB"],
  ])("%d is %s", (n, s) => expect(formatBytes(n)).toBe(s));
});

describe("formatDate", () => {
  it("shows a date and time in the viewer's locale", () => {
    expect(formatDate("2026-03-04T15:30:00Z")).toMatch(/2026/);
  });
  it("copes with empty, zero and broken values", () => {
    expect(formatDate("")).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("0001-01-01T00:00:00Z")).toBe("—");
    expect(formatDate("nonsense")).toBe("—");
  });
  it("understands the millisecond timestamps rmapi writes as text", () => {
    expect(formatDate("1772638200000")).toMatch(/2026/);
  });
});
