import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { LogEntry } from "../../api/types";
import { ErrorNote, Loading, PageHeader } from "../../components/ui";
import { useResource } from "../../lib/useResource";

interface LogsResponse {
  entries: LogEntry[] | null;
  last: number;
}

const LEVELS = ["trace", "debug", "info", "warn", "error"];
const LIMIT = 500;
const FOLLOW_MS = 3000;
const colour: Record<string, string> = {
  error: "text-red-600 dark:text-red-400",
  fatal: "text-red-600 dark:text-red-400",
  panic: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  warn: "text-amber-600 dark:text-amber-400",
  debug: "text-muted",
  trace: "text-muted",
};

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function LogsPage() {
  const [level, setLevel] = useState("info");
  const [text, setText] = useState("");
  const [follow, setFollow] = useState(true);
  const q = useDebounced(text, 300);

  const snapshot = useResource(`logs:${level}:${q}`, (signal) => api<LogsResponse>("logs", { query: { level, q, limit: LIMIT }, signal }));
  const base = snapshot.data;
  const [more, setMore] = useState<{ base: LogsResponse | undefined; lines: LogEntry[]; last: number }>({ base: undefined, lines: [], last: 0 });
  const current = more.base === base ? more : { base, lines: [], last: base?.last ?? 0 };
  const last = useRef(0);
  useEffect(() => {
    last.current = current.last;
  });

  useEffect(() => {
    if (!follow || !base) return;
    const timer = setInterval(() => {
      api<LogsResponse>("logs", { query: { level, q, since: last.current || undefined, limit: LIMIT } }).then(
        (r) => {
          if (r.entries?.length) setMore((m) => ({ base, lines: [...(m.base === base ? m.lines : []), ...(r.entries ?? [])].slice(-LIMIT * 4), last: r.last }));
        },
        () => undefined,
      );
    }, FOLLOW_MS);
    return () => clearInterval(timer);
  }, [follow, base, level, q]);

  const lines = [...(base?.entries ?? []), ...current.lines];
  const forbidden = snapshot.error instanceof ApiError && snapshot.error.status === 403;

  return (
    <>
      <PageHeader title="Logs" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Minimum level
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-2">
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <input
          type="search"
          aria-label="Search"
          placeholder="Search the logs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-11 min-w-48 flex-1 rounded-lg border border-line bg-surface px-3"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
      </div>

      {forbidden ? <ErrorNote error={new Error("Dev features are not enabled for this user.")} /> : <ErrorNote error={snapshot.error} />}
      {snapshot.loading && !base ? (
        <Loading />
      ) : lines.length === 0 && base ? (
        <p className="py-6 text-muted">No log lines match.</p>
      ) : (
        <ol className="overflow-x-auto rounded-card border border-line bg-raised p-3 font-mono text-xs leading-relaxed">
          {lines.map((l) => (
            <li key={l.seq} className="whitespace-pre-wrap break-words">
              <span className="text-muted">{new Date(l.time).toLocaleTimeString()}</span>{" "}
              <span className={`font-semibold ${colour[l.level] ?? ""}`}>{l.level}</span> {l.message}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
