import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

async function start() {
  // Demo builds answer every backend call in the browser, so this must run before the app loads.
  if (import.meta.env.VITE_DEMO === "1") (await import("./demo")).installDemo();
  const { App } = await import("./App");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
