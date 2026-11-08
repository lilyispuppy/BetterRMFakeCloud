import { useCallback, useEffect, useState } from "react";

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload(): void;
}

/**
 * Loads something when `key` changes, and again when `reload` is called. While
 * it reloads the previous data stays available, so lists do not flash empty.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>): Resource<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown } | null>(null);
  const current = `${key}#${version}`;

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => !controller.signal.aborted && setState({ key: current, data }),
      (error: unknown) => !controller.signal.aborted && setState({ key: current, error }),
    );
    return () => controller.abort();
    // `load` is a new function each render; the key says when it would give a different answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: state?.data, error: state?.key === current ? state.error : undefined, loading: state?.key !== current, reload };
}
