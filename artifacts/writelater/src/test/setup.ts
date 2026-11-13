import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { IDBFactory } from "fake-indexeddb";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
  // Fresh, empty IndexedDB and localStorage for every test.
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
