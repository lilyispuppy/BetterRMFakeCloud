const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** Dates arrive as ISO text, or as millisecond timestamps written as text. */
export function formatDate(value: string | undefined | null): string {
  if (!value || value.startsWith("0001-")) return "—";
  const date = /^\d{10,}$/.test(value) ? new Date(Number(value)) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
