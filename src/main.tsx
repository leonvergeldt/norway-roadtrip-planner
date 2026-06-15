import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const registration = await navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl });
      const urlsToCache = [
        baseUrl,
        `${baseUrl}index.html`,
        `${baseUrl}manifest.webmanifest`,
        `${baseUrl}icon.svg`,
        ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).map((item) => item.src),
        ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).map(
          (item) => item.href,
        ),
      ];
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      worker?.postMessage({ type: "CACHE_URLS", urls: urlsToCache });
    } catch {
      // The app still works online if service worker registration fails.
    }
  });
}
