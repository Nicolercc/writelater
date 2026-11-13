import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Files in public/ that belong to the app shell. */
export const PUBLIC_SHELL_FILES = [
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-512.png",
  "manifest.webmanifest",
];

/** Bundle outputs to precache: everything except source maps and the worker itself. */
export function precacheList(bundleFiles: string[], publicFiles: string[] = PUBLIC_SHELL_FILES): string[] {
  const fromBundle = bundleFiles.filter((f) => !f.endsWith(".map") && f !== "sw.js");
  return [...new Set([...fromBundle, ...publicFiles])].sort();
}

/**
 * A version derived from the shell's contents, so the worker changes (and
 * the browser installs an update) exactly when the shell changes.
 */
export function shellVersion(files: Array<{ name: string; content: string | Uint8Array }>): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(file.name);
    hash.update(file.content);
  }
  return hash.digest("hex").slice(0, 16);
}

const VERSION_LINE = 'const VERSION = "__VERSION__";';
const PRECACHE_LINE = "const PRECACHE = __PRECACHE__;";

/**
 * Fills the template's two declaration lines. Matches the whole declarations
 * (not bare tokens) so mentions of the placeholders in comments are untouched.
 */
export function renderServiceWorker(template: string, version: string, precache: string[]): string {
  if (template.split(VERSION_LINE).length !== 2 || template.split(PRECACHE_LINE).length !== 2) {
    throw new Error("Service worker template must declare VERSION and PRECACHE exactly once.");
  }
  return template
    .replace(VERSION_LINE, `const VERSION = ${JSON.stringify(version)};`)
    .replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(precache)};`);
}

/** Emits sw.js with a precache list built from the final bundle. Build only. */
export function serviceWorkerPlugin(options: { root: string }): Plugin {
  return {
    name: "writelater-service-worker",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const template = readFileSync(path.join(options.root, "sw/service-worker.js"), "utf8");
      const publicDir = path.join(options.root, "public");
      const files = Object.values(bundle).map((item) => ({
        name: item.fileName,
        content: item.type === "chunk" ? item.code : item.source,
      }));
      const publicFiles = PUBLIC_SHELL_FILES.map((name) => ({
        name,
        content: readFileSync(path.join(publicDir, name)),
      }));
      const precache = precacheList(files.map((f) => f.name));
      const version = shellVersion([...files, ...publicFiles]);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: renderServiceWorker(template, version, precache),
      });
    },
  };
}
