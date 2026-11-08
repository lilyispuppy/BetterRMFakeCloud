import { describe, expect, it } from "vitest";
import { breadcrumbs, childrenOf, locate, search } from "./tree";
import { tree } from "../../test/fixtures";

describe("locate", () => {
  it("finds the root", () => {
    expect(locate(tree, undefined)).toMatchObject({ kind: "folder", id: "", name: "Library" });
  });
  it("finds folders and documents at any depth", () => {
    expect(locate(tree, "f2")).toMatchObject({ kind: "folder", name: "Taxes" });
    expect(locate(tree, "d3")).toMatchObject({ kind: "document", entry: { name: "Form" }, parentId: "f2" });
  });
  it("knows the trash, and what is in it", () => {
    expect(locate(tree, "trash")).toMatchObject({ kind: "folder", id: "trash", name: "Trash" });
    expect(locate(tree, "d9")).toMatchObject({ kind: "document", parentId: "trash", trashed: true });
  });
  it("says so when there is no such item", () => {
    expect(locate(tree, "nope")).toEqual({ kind: "missing" });
  });
  it("copes with a tree that has no entries", () => {
    expect(locate({ Entries: null, Trash: null }, undefined)).toMatchObject({ kind: "folder", id: "" });
  });
});

describe("childrenOf", () => {
  it("lists the entries of the root, a folder, and the trash", () => {
    expect(childrenOf(tree, "").map((e) => e.name)).toEqual(["Work", "Notes", "Sketch"]);
    expect(childrenOf(tree, "f2").map((e) => e.name)).toEqual(["Form"]);
    expect(childrenOf(tree, "trash").map((e) => e.name)).toEqual(["Old"]);
  });
});

describe("breadcrumbs", () => {
  it("runs from the root to the folder", () => {
    expect(breadcrumbs(tree, "f2").map((b) => b.name)).toEqual(["Library", "Work", "Taxes"]);
    expect(breadcrumbs(tree, "d3").map((b) => b.name)).toEqual(["Library", "Work", "Taxes", "Form"]);
  });
  it("is just the root at the root, and Trash for the trash", () => {
    expect(breadcrumbs(tree, "").map((b) => b.name)).toEqual(["Library"]);
    expect(breadcrumbs(tree, "d9").map((b) => b.name)).toEqual(["Library", "Trash", "Old"]);
  });
});

describe("search", () => {
  it("finds documents and folders in every folder, ignoring case", () => {
    expect(search(tree, "FORM").map((r) => r.entry.name)).toEqual(["Form"]);
    expect(search(tree, "t").map((r) => r.entry.name).sort()).toEqual(["Notes", "Sketch", "Taxes"]);
  });
  it("says where each result lives", () => {
    expect(search(tree, "form")[0]?.where).toBe("Library / Work / Taxes");
  });
  it("leaves out the trash", () => {
    expect(search(tree, "old")).toEqual([]);
  });
  it("finds nothing for an empty query", () => {
    expect(search(tree, "  ")).toEqual([]);
  });
});
