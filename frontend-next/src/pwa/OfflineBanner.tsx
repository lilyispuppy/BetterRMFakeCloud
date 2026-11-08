import { useOnline } from "./useOnline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <p role="status" className="bg-amber-500/20 px-4 py-2 text-center text-sm">
      You are offline. Pages and documents you have already opened are still available.
    </p>
  );
}
