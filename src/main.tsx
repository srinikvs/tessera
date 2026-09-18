import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const BUILD = "1.1.22";
const BUILD_KEY = "tessera-asset-v";

async function bustStaleAssets(): Promise<void> {
  try {
    let hadSw = false;
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      hadSw = regs.length > 0;
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const prev = localStorage.getItem(BUILD_KEY);
    if (prev !== BUILD) {
      localStorage.setItem(BUILD_KEY, BUILD);
      if (hadSw || (prev && prev !== BUILD)) {
        location.reload();
        return;
      }
    }
  } catch {
    /* cache bust is best-effort */
  }
}

void bustStaleAssets();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
