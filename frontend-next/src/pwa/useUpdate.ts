import { useEffect, useRef, useState } from "react";
import { registerServiceWorker } from "./register";

export function useServiceWorkerUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const update = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    update.current = registerServiceWorker(() => setNeedRefresh(true));
  }, []);

  return { needRefresh, update: () => void update.current(), dismiss: () => setNeedRefresh(false) };
}
