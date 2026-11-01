import { useState } from "react";
import { Alert, Button, Col, Form, ListGroup, Row } from "react-bootstrap";

import apiservice from "../../services/api.service";
import { findText, lsText } from "./format";
import { getAnnotatedPdf, getRmdoc } from "./download";

// resolve a path to an entry id through stat, as rmapi resolves it on the cloud
const idFor = (path) => apiservice.rm("stat", { path }).then((st) => ({ id: st.id, name: st.name }));

// The tools mirror ddvk/rmapi. Each run() resolves to the text to print.
const tools = [
  {
    name: "ls",
    summary: "List a folder (or show a document)",
    fields: [{ key: "path", label: "Path", placeholder: "/", initial: "/" }],
    run: (v) => apiservice.rm("ls", { path: v.path }).then(lsText),
  },
  {
    name: "find",
    summary: "Search below a path by regular expression, tag or star",
    fields: [
      { key: "path", label: "Start path", placeholder: "/", initial: "/" },
      { key: "pattern", label: "Regular expression", placeholder: "^/Work/" },
      { key: "tags", label: "Tags (comma separated, any of)", placeholder: "work, ref" },
      { key: "starred", label: "Starred", options: ["", "true", "false"] },
    ],
    run: (v) =>
      apiservice
        .rm("find", {
          path: v.path,
          pattern: v.pattern,
          tag: (v.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
          starred: v.starred,
        })
        .then(findText),
  },
  {
    name: "stat",
    summary: "Everything known about one entry, as JSON",
    fields: [{ key: "path", label: "Path", placeholder: "/Folder/Document" }],
    run: (v) => apiservice.rm("stat", { path: v.path }).then((st) => JSON.stringify(st, null, 2)),
  },
  {
    name: "get",
    summary: "Download a document as an rmdoc archive",
    fields: [{ key: "path", label: "Path", placeholder: "/Folder/Document" }],
    run: (v) =>
      idFor(v.path).then(({ id, name }) => getRmdoc(id, name).then(() => `Downloaded ${name}.rmdoc`)),
  },
  {
    name: "geta",
    summary: "Download a document as a PDF with its annotations",
    fields: [{ key: "path", label: "Path", placeholder: "/Folder/Document" }],
    run: (v) =>
      idFor(v.path).then(({ id, name }) => getAnnotatedPdf(id, name).then(() => `Downloaded ${name}.pdf`)),
  },
  {
    name: "account",
    summary: "Show the synced account",
    fields: [],
    run: () => apiservice.rm("info").then((i) => JSON.stringify(i, null, 2)),
  },
  {
    name: "version",
    summary: "Show what this explorer follows",
    fields: [],
    run: () =>
      Promise.resolve(
        "rmfakecloud explorer, following the ddvk/rmapi command set (reference v0.0.35).\nRead-only for now."
      ),
  },
];

// shown so the whole rmapi surface is visible, but they change data
const comingSoon = [
  ["put", "Upload a document"],
  ["mput", "Upload a folder of documents"],
  ["mget", "Download a folder recursively"],
  ["mkdir", "Create a folder"],
  ["mv", "Move or rename"],
  ["rm", "Delete"],
  ["nuke", "Remove everything"],
];

export default function Tools() {
  const [current, setCurrent] = useState(tools[0]);
  const [values, setValues] = useState({});
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const valueOf = (f) => (values[f.key] !== undefined ? values[f.key] : f.initial || "");

  const select = (tool) => {
    setCurrent(tool);
    setValues({});
    setOutput("");
    setError("");
  };

  const run = (e) => {
    e.preventDefault();
    const v = {};
    current.fields.forEach((f) => (v[f.key] = valueOf(f)));
    setRunning(true);
    setError("");
    current
      .run(v)
      .then((text) => setOutput(text || ""))
      .catch((err) => {
        setOutput("");
        setError(err.message || "Failed");
      })
      .finally(() => setRunning(false));
  };

  return (
    <Row>
      <Col md={4} lg={3}>
        <ListGroup className="mb-3">
          {tools.map((t) => (
            <ListGroup.Item
              key={t.name}
              action
              active={t.name === current.name}
              onClick={() => select(t)}
            >
              <code className={t.name === current.name ? "text-white" : ""}>{t.name}</code>
              <div className="small">{t.summary}</div>
            </ListGroup.Item>
          ))}
        </ListGroup>
        <h6 className="text-muted">Coming soon</h6>
        <ListGroup>
          {comingSoon.map(([name, summary]) => (
            <ListGroup.Item key={name} disabled>
              <code>{name}</code>
              <div className="small">{summary}</div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Col>
      <Col md={8} lg={9}>
        <h5>
          <code>{current.name}</code>
        </h5>
        <p className="text-muted">{current.summary}</p>
        <Form onSubmit={run}>
          {current.fields.map((f) => (
            <Form.Group className="mb-2" key={f.key} controlId={`tool-${f.key}`}>
              <Form.Label>{f.label}</Form.Label>
              {f.options ? (
                <Form.Select
                  value={valueOf(f)}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o || "either"}</option>
                  ))}
                </Form.Select>
              ) : (
                <Form.Control
                  value={valueOf(f)}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </Form.Group>
          ))}
          <Button type="submit" disabled={running}>
            {running ? "Running..." : "Run"}
          </Button>
        </Form>
        {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
        {output && (
          <pre className="border rounded p-2 mt-3" style={{ maxHeight: "55vh", overflow: "auto" }}>
            {output}
          </pre>
        )}
      </Col>
    </Row>
  );
}
