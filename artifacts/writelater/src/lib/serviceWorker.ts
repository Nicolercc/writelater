/**
 * Registers the offline service worker (production builds only) and reports
 * when a new version is installed and waiting. The new version takes over
 * only when the person chooses to reload, so an open tab never runs two
 * versions' code at once.
 *
 * When one tab accepts an update, the new worker takes control of every tab
 * and deletes the old version's cache. Other open tabs are still running the
 * old code and may request files that no longer exist, so they're told to
 * reload too.
 */

let updatingHere = false;

/**
 * True when a controller change means another tab installed an update:
 * this page was already controlled when it loaded (so it isn't a first
 * install) and this tab didn't ask for the update itself.
 */
export function replacedElsewhere(state: { hadControllerAtLoad: boolean; initiatedHere: boolean }): boolean {
  return state.hadControllerAtLoad && !state.initiatedHere;
}

/**
 * True when a newly installed worker is an update waiting to take over:
 * a version already controlled the page when this one *started* installing,
 * and it is now the registration's waiting worker.
 *
 * Checking the controller when installation starts (not when it finishes)
 * matters on a first install: the worker installs, activates, and claims the
 * page at once, and WebKit can deliver the "installed" event after that
 * claim. A finish-time check then sees a controller and shows a false
 * "new version is ready" banner whose Reload does nothing.
 */
export function isUpdateReady(state: { controlledWhenInstallStarted: boolean; isWaiting: boolean }): boolean {
  return state.controlledWhenInstallStarted && state.isWaiting;
}

export function registerServiceWorker(
  onUpdateReady: (worker: ServiceWorker) => void,
  onReplacedElsewhere: () => void,
): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  const base = import.meta.env.BASE_URL;
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (replacedElsewhere({ hadControllerAtLoad, initiatedHere: updatingHere })) onReplacedElsewhere();
  });

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
          const controlledWhenInstallStarted = !!navigator.serviceWorker.controller;
          installing?.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              isUpdateReady({ controlledWhenInstallStarted, isWaiting: registration.waiting === installing })
            ) {
              onUpdateReady(installing);
            }
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
  updatingHere = true;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  worker.postMessage({ type: "SKIP_WAITING" });
}
