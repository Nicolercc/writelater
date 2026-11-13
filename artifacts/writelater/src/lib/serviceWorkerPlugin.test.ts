import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { precacheList, renderServiceWorker, shellVersion } from "../../sw/plugin";

const template = readFileSync(path.join(import.meta.dirname, "../../sw/service-worker.js"), "utf8");

describe("service worker build", () => {
  it("precaches the bundle and shell files but not maps or the worker", () => {
    expect(precacheList(["index.html", "assets/index-abc.js", "assets/index-abc.js.map", "sw.js"], ["favicon.svg"])).toEqual([
      "assets/index-abc.js",
      "favicon.svg",
      "index.html",
    ]);
  });

  it("changes version exactly when shell content changes", () => {
    const a = shellVersion([{ name: "index.html", content: "<html>1" }, { name: "a.js", content: "x" }]);
    const reordered = shellVersion([{ name: "a.js", content: "x" }, { name: "index.html", content: "<html>1" }]);
    const changed = shellVersion([{ name: "index.html", content: "<html>2" }, { name: "a.js", content: "x" }]);
    expect(a).toBe(reordered);
    expect(a).not.toBe(changed);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("fills the template's placeholders and produces valid JavaScript", () => {
    const out = renderServiceWorker(template, "v123", ["index.html", "assets/a.js"]);
    expect(out).toContain('const VERSION = "v123";');
    expect(out).toContain('const PRECACHE = ["index.html","assets/a.js"];');
    // The header comment may mention the placeholders; the code must not.
    expect(out).not.toMatch(/= (__PRECACHE__|"__VERSION__")/);
    expect(() => new Function(out)).not.toThrow();
  });

  it("never activates a new version on its own", () => {
    // skipWaiting only in response to the page's explicit message.
    const calls = template.match(/skipWaiting\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(template).toMatch(/SKIP_WAITING"\) self\.skipWaiting\(\)/);
  });

  it("refuses a template without placeholders", () => {
    expect(() => renderServiceWorker("self.x = 1;", "v", [])).toThrow();
  });
});
