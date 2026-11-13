/**
 * Registers the offline service worker (production builds only) and reports
 * when a new version is installed and waiting. The new version takes over
 * only when the person chooses to reload, so an open tab never runs two
 * versions' code at once.
 */
export function registerServiceWorker(onUpdateReady: (worker: ServiceWorker) => void): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const base = import.meta.env.BASE_URL;
  // Register after load so the worker's precache doesn't compete with first paint.
  const register = () => {
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        const notify = (worker: ServiceWorker | null) => {
          // Only an update if a previous version already controls the page.
          if (worker && navigator.serviceWorker.controller) onUpdateReady(worker);
        };
        notify(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") notify(installing);
          });
        });
        // Check for a new version whenever the app comes back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update().catch(() => {});
        });
      })
      .catch(() => {
        // Offline support is an enhancement; the app works without it.
      });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/** Activates a waiting version, then reloads once it controls the page. */
export function applyUpdate(worker: ServiceWorker): void {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  worker.postMessage({ type: "SKIP_WAITING" });
}
