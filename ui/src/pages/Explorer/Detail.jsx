import { useState } from "react";
import { Alert, Badge, Button, Stack, Tab, Table, Tabs } from "react-bootstrap";
import { toast } from "react-toastify";

import useFetch from "../../hooks/useFetch";
import Spinner from "../../components/Spinner";
import { formatMillis, humanSize, isFolder } from "./format";
import { getAnnotatedPdf, getRmdoc } from "./download";

const pretty = (raw) => {
  if (!raw) return "";
  try {
    return JSON.stringify(typeof raw === "string" ? JSON.parse(raw) : raw, null, 2);
  } catch {
    return String(raw);
  }
};

function Row({ label, children }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <tr>
      <th style={{ width: "30%", whiteSpace: "nowrap" }}>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function Overview({ st }) {
  const c = st.content || {};
  return (
    <Table size="sm" bordered>
      <tbody>
        <Row label="Name">{st.name}</Row>
        <Row label="Path"><code>{st.path}</code></Row>
        <Row label="ID"><code>{st.id}</code></Row>
        <Row label="Kind">{isFolder(st) ? "Folder" : st.fileType || "Document"}</Row>
        <Row label="Version">{st.version}</Row>
        <Row label="Starred">{st.starred ? "Yes" : "No"}</Row>
        <Row label="Tags">
          {st.tags && st.tags.length
            ? st.tags.map((t) => <Badge key={t} bg="secondary" className="me-1">{t}</Badge>)
            : null}
        </Row>
        <Row label="Modified">{formatMillis(st.lastModified)}</Row>
        <Row label="Last opened">{formatMillis(st.lastOpened)}</Row>
        <Row label="Created">{formatMillis(st.createdTime)}</Row>
        <Row label="Current page">{isFolder(st) ? null : st.currentPage + 1}</Row>
        <Row label="Pages">{c.pageCount || (st.pages && st.pages.length) || null}</Row>
        <Row label="Orientation">{c.orientation}</Row>
        <Row label="Format version">{c.formatVersion}</Row>
        <Row label="Cover page">
          {c.coverPageNumber === undefined || c.coverPageNumber === null
            ? null
            : c.coverPageNumber === -1 ? "last page" : c.coverPageNumber + 1}
        </Row>
        <Row label="Font">{c.fontName}</Row>
        <Row label="Text scale">{c.textScale}</Row>
        <Row label="Margins">{c.margins}</Row>
        <Row label="Line height">{c.lineHeight}</Row>
        <Row label="Last pen">{c.extraMetadata && c.extraMetadata.LastPen}</Row>
        <Row label="Stored size">{st.totalSize ? humanSize(st.totalSize) : null}</Row>
        <Row label="Document hash">{st.hash ? <code>{st.hash}</code> : null}</Row>
      </tbody>
    </Table>
  );
}

function Files({ st, dev }) {
  if (!st.files.length) return <p className="text-muted">No files.</p>;
  return (
    <Table size="sm" bordered>
      <thead>
        <tr>
          <th>File</th>
          <th>Size</th>
          {dev && <th>Hash</th>}
        </tr>
      </thead>
      <tbody>
        {st.files.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td>{humanSize(f.size)}</td>
            {dev && <td><code>{f.hash}</code></td>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Pages({ st }) {
  if (!st.pages.length) {
    return <p className="text-muted">No page list in this document&rsquo;s .content.</p>;
  }
  return (
    <Table size="sm" bordered>
      <thead>
        <tr>
          <th>#</th>
          <th>Page ID</th>
          <th>PDF page</th>
          <th>Template</th>
          <th>Tags</th>
        </tr>
      </thead>
      <tbody>
        {st.pages.map((p) => (
          <tr key={p.id}>
            <td>{p.index + 1}</td>
            <td><code>{p.id}</code></td>
            <td>{p.docPage >= 0 ? p.docPage + 1 : ""}</td>
            <td>{p.template}</td>
            <td>{p.tags.map((t) => <Badge key={t} bg="secondary" className="me-1">{t}</Badge>)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Raw({ st }) {
  return (
    <>
      <h6>.metadata</h6>
      <pre className="border rounded p-2">{pretty(st.rawMetadata) || "not available"}</pre>
      <h6>.content</h6>
      <pre className="border rounded p-2">{pretty(st.rawContent) || "not available"}</pre>
    </>
  );
}

// Detail shows everything the server knows about one entry. Mount it with
// key={id} so it starts fresh for each selection.
export default function Detail({ id, dev }) {
  const { data: st, error, loading } = useFetch(`rm/stat?id=${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState(false);

  if (loading && !st) return <Spinner />;
  if (error) {
    return <Alert variant="danger">{`Error ${error.status || ""}: ${error.statusText || "could not load"}`}</Alert>;
  }
  if (!st) return null;

  const download = (fn) => {
    setBusy(true);
    fn(st.id, st.name)
      .catch((e) => toast.error(e.message || "Download failed"))
      .finally(() => setBusy(false));
  };
  const canDownload = !isFolder(st) && st.id !== "trash";

  return (
    <>
      <Stack direction="horizontal" gap={2} className="mb-2">
        <h5 className="mb-0">{st.name}</h5>
        <small className="text-muted">{st.path}</small>
        {canDownload && (
          <span className="ms-auto">
            <Button size="sm" variant="outline-primary" className="me-2" disabled={busy}
              onClick={() => download(getRmdoc)}>
              Download (rmdoc)
            </Button>
            <Button size="sm" variant="outline-primary" disabled={busy}
              onClick={() => download(getAnnotatedPdf)}>
              Annotated PDF
            </Button>
          </span>
        )}
      </Stack>
      <Tabs defaultActiveKey="overview" className="mb-2">
        <Tab eventKey="overview" title="Overview"><Overview st={st} /></Tab>
        <Tab eventKey="files" title={`Files (${st.files.length})`}><Files st={st} dev={dev} /></Tab>
        <Tab eventKey="pages" title={`Pages (${st.pages.length})`}><Pages st={st} /></Tab>
        {dev && <Tab eventKey="raw" title="Raw JSON"><Raw st={st} /></Tab>}
      </Tabs>
    </>
  );
}
