import { describe, expect, it, vi } from "vitest";
import { formatBytes, getStorageStatus, requestPersistence } from "./persist";

function fakeStorage(opts: { persisted?: boolean; grant?: boolean; throws?: boolean } = {}) {
  let persisted = opts.persisted ?? false;
  return {
    persisted: vi.fn(async () => {
      if (opts.throws) throw new Error("blocked");
      return persisted;
    }),
    persist: vi.fn(async () => {
      persisted = opts.grant ?? false;
      return persisted;
    }),
    estimate: vi.fn(async () => ({ usage: 2048, quota: 10 * 1024 * 1024 })),
  };
}

describe("getStorageStatus", () => {
  it("reports unsupported when the Storage API is missing", async () => {
    expect(await getStorageStatus(undefined)).toEqual({ persistence: "unsupported" });
    expect(await getStorageStatus({})).toEqual({ persistence: "unsupported" });
  });

  it("reports the grant and the estimate", async () => {
    expect(await getStorageStatus(fakeStorage({ persisted: true }))).toEqual({
      persistence: "persisted",
      usage: 2048,
      quota: 10 * 1024 * 1024,
    });
    expect((await getStorageStatus(fakeStorage())).persistence).toBe("best-effort");
  });

  it("treats a throwing API as unsupported", async () => {
    expect(await getStorageStatus(fakeStorage({ throws: true }))).toEqual({ persistence: "unsupported" });
  });
});

describe("requestPersistence", () => {
  it("doesn't ask again once granted", async () => {
    const storage = fakeStorage({ persisted: true });
    expect(await requestPersistence(storage)).toBe("persisted");
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it("returns the browser's answer", async () => {
    expect(await requestPersistence(fakeStorage({ grant: true }))).toBe("persisted");
    expect(await requestPersistence(fakeStorage({ grant: false }))).toBe("best-effort");
  });

  it("never throws", async () => {
    expect(await requestPersistence(fakeStorage({ throws: true }))).toBe("best-effort");
    expect(await requestPersistence(undefined)).toBe("unsupported");
  });
});

describe("formatBytes", () => {
  it.each([
    [500, "500 B"],
    [2048, "2.0 KB"],
    [15 * 1024 * 1024, "15 MB"],
    [3.4 * 1024 ** 3, "3.4 GB"],
  ])("%d -> %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
