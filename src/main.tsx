import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "@/app/styles.css";
import "@/app/help.css";
import "@/app/playtest.css";
import "@/app/art-deco.css";
import "@/app/cabinet-builds.css";
import "@/app/mobile-console.css";
import { registerSW } from "virtual:pwa-register";
import { gameUpdates } from "@/app/update-policy";
import { initialLanguage, setLanguage } from "@/i18n/language";
import "@/app/language.css";

setLanguage(initialLanguage(), false);

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => gameUpdates.offer(() => updateSW()),
  onNeedReload: () => gameUpdates.activationReady()
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
