import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  // some tests run in a plain Node environment, without a browser
  if (typeof localStorage !== "undefined") localStorage.clear();
});
