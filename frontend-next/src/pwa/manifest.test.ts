import { describe, expect, it } from "vitest";
import { manifest } from "./manifest";

describe("web app manifest", () => {
  it("is installable: a name, a start page, a display mode and icons", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  });

  it("points only at icons that exist", async () => {
    const { existsSync } = await import("node:fs");
    for (const icon of manifest.icons) {
      expect(existsSync(`public${icon.src}`), icon.src).toBe(true);
    }
  });

  it("takes PDFs and other documents shared from other apps", () => {
    const target = manifest.share_target;
    expect(target.action).toBe("/share-target");
    expect(target.method).toBe("POST");
    expect(target.enctype).toBe("multipart/form-data");
    expect(target.params.files[0]?.name).toBe("file");
    expect(target.params.files[0]?.accept).toEqual(expect.arrayContaining(["application/pdf", ".pdf"]));
  });
});
