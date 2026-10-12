// Installing Novena as an app and using it offline: registers the service worker (src/sw.js; production builds only),
// offers a new version with a toast instead of reloading by itself, and keeps the browser's install prompt for the
// "Install the app" button in Settings.
import { signal } from "@preact/signals";
import { toast } from "../components/Toast";

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

/** The browser's install prompt, when it has offered one (Chrome, Edge, Samsung Internet and others; not Safari or Firefox). */
export const installPrompt = signal<InstallPrompt | null>(null);
/** Already running as an installed app. */
export const installed = signal(typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
/** Safari on iPhone or iPad, which installs through Share → Add to Home Screen rather than a prompt. */
export const iosSafari = typeof navigator !== "undefined"
  && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  && !(navigator as Navigator & { standalone?: boolean }).standalone;

export async function install(): Promise<void> {
  const p = installPrompt.value;
  if (!p) return;
  installPrompt.value = null; // a prompt can only be shown once
  await p.prompt();
}

export function setupPwa(): void {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt.value = e as InstallPrompt; });
  window.addEventListener("appinstalled", () => { installPrompt.value = null; installed.value = true; });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then((reg) => {
      const offer = (w: ServiceWorker) => {
        if (!navigator.serviceWorker.controller) return; // the first install: nothing older is running
        toast("A new version is ready.", { stay: true, action: { label: "Reload", run: () => {
          navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
          w.postMessage({ type: "SKIP_WAITING" });
        } } });
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed") offer(w); });
      });
      setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000); // a tab left open still hears of updates
    }).catch(() => {}); // not allowed here (private mode, some browsers' settings): the site works as before
  });
}
