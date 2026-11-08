import { Button } from "../components/ui";

export function UpdateToast({ needRefresh, onUpdate, onDismiss }: { needRefresh: boolean; onUpdate(): void; onDismiss(): void }) {
  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 shadow-lg md:bottom-6">
      <span className="text-sm">A new version is available.</span>
      <span className="flex gap-2">
        <Button onClick={onDismiss}>Later</Button>
        <Button variant="primary" onClick={onUpdate}>
          Reload
        </Button>
      </span>
    </div>
  );
}
