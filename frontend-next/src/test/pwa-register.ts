// Stands in for the module vite-plugin-pwa generates, which does not exist in unit tests.
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
