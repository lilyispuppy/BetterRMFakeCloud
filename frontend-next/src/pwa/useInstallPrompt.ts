import { useCallback, useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** The browser offers to install the app once; keep the offer until the person asks for it. */
export function useInstallPrompt() {
  const [offer, setOffer] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onOffer = (e: Event) => {
      e.preventDefault();
      setOffer(e as InstallPromptEvent);
    };
    const onInstalled = () => setOffer(null);
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!offer) return;
    await offer.prompt();
    await offer.userChoice;
    setOffer(null);
  }, [offer]);

  return { canInstall: offer !== null, install };
}
