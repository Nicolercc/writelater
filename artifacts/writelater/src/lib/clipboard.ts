/**
 * Writes text to the clipboard. Resolves false (never throws) when the
 * Clipboard API is missing or the browser refuses, so callers can show a
 * select-and-copy fallback instead of a false success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
