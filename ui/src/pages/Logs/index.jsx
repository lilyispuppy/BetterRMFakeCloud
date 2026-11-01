import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Container, Form, Stack } from "react-bootstrap";

import apiService from "../../services/api.service";
import { formatDate } from "../../common/date";

const POLL_MS = 2000;
// keep the page light: drop the oldest lines beyond this
const MAX_LINES = 2000;

const levels = ["trace", "debug", "info", "warn", "error"];

const levelColour = {
  trace: "#8a8a8a",
  debug: "#8a8a8a",
  info: "inherit",
  warning: "#e4c04a",
  error: "#ff6b6b",
  fatal: "#ff1744",
  panic: "#ff1744",
};

export default function Logs() {
  const [entries, setEntries] = useState([]);
  const [level, setLevel] = useState("info");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState(null);

  // cursor for incremental polling, reset whenever the filters change
  const cursor = useRef(0);
  const bottom = useRef(null);

  const fetchMore = useCallback(async () => {
    try {
      const res = await apiService.getLogs({
        since: cursor.current,
        level,
        q: query,
      });
      if (!res) return;
      setError(null);
      cursor.current = res.last;
      if (res.entries && res.entries.length) {
        setEntries((prev) => [...prev, ...res.entries].slice(-MAX_LINES));
      }
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [level, query]);

  // filters changed: start again from scratch
  useEffect(() => {
    cursor.current = 0;
    setEntries([]);
  }, [level, query]);

  useEffect(() => {
    if (paused) return undefined;
    fetchMore();
    const id = setInterval(fetchMore, POLL_MS);
    return () => clearInterval(id);
  }, [fetchMore, paused]);

  useEffect(() => {
    if (follow && bottom.current) {
      bottom.current.scrollIntoView({ block: "end" });
    }
  }, [entries, follow]);

  return (
    <Container fluid style={{ height: "100%", display: "flex", flexDirection: "column", paddingTop: 8 }}>
      <Stack direction="horizontal" gap={3} className="mb-2 flex-wrap">
        <h3 className="mb-0">Logs</h3>
        <Form.Select
          aria-label="Minimum level"
          style={{ width: "auto" }}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Form.Select>
        <Form.Control
          type="search"
          placeholder="Search"
          style={{ maxWidth: 300 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant={paused ? "primary" : "outline-secondary"} onClick={() => setPaused(!paused)}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Form.Check
          type="switch"
          id="logs-follow"
          label="Follow"
          checked={follow}
          onChange={(e) => setFollow(e.target.checked)}
        />
        <Button variant="outline-secondary" onClick={() => setEntries([])}>
          Clear view
        </Button>
        <span className="text-muted ms-auto">{entries.length} lines</span>
      </Stack>

      {error && (
        <Alert variant="danger" className="mb-2">
          {error}
        </Alert>
      )}

      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "auto",
          fontFamily: "monospace",
          fontSize: "0.8rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {entries.map((e) => (
          <div key={e.seq} style={{ color: levelColour[e.level] || "inherit" }}>
            <span className="text-muted">{formatDate(e.time)}</span>{" "}
            <strong>{e.level.toUpperCase().padEnd(7)}</strong> {e.message}
          </div>
        ))}
        {!entries.length && !error && <div className="text-muted">No log lines yet.</div>}
        <div ref={bottom} />
      </div>
    </Container>
  );
}
