import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;

// The Excalidraw PWA service worker may serve the cached main index for an
// unknown navigation. Preserve the isolated Canvas lab even in that case.
if (window.location.pathname.endsWith("/custom-elements.html")) {
  void import("./dev/customElementsApp");
} else {
  const root = createRoot(rootElement);
  registerSW();
  root.render(
    <StrictMode>
      <ExcalidrawApp />
    </StrictMode>,
  );
}
