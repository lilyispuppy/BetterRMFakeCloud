import { useMemo, useState } from "react";
import { Col, Form, Row, Stack } from "react-bootstrap";
import { Tree } from "react-arborist";
import { BsFileEarmarkText, BsFolder, BsStarFill, BsTrash } from "react-icons/bs";

import Detail from "./Detail";
import { collectTags, filterTree, isFolder, toTreeData } from "./format";

function icon(n) {
  if (n.id === "trash") return <BsTrash />;
  if (isFolder(n)) return <BsFolder />;
  return <BsFileEarmarkText />;
}

function NodeRow({ node, style, dragHandle }) {
  const n = node.data;
  return (
    <div
      style={{ ...style, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      ref={dragHandle}
      className={node.isSelected ? "bg-primary-subtle rounded" : ""}
      onClick={() => node.isInternal && node.toggle()}
    >
      {icon(n)} {n.name}
      {n.starred && <BsStarFill className="ms-1 text-warning" title="Starred" />}
    </div>
  );
}

export default function Browse({ root, dev }) {
  const [term, setTerm] = useState("");
  const [tag, setTag] = useState("");
  const [starred, setStarred] = useState(false);
  const [selected, setSelected] = useState(null);

  const tags = useMemo(() => collectTags(root.children), [root]);
  const filtering = !!(term.trim() || tag || starred);
  const data = useMemo(
    () => toTreeData(filtering ? filterTree(root.children, { term, tag, starred }) : root.children),
    [root, filtering, term, tag, starred]
  );

  return (
    <Row>
      <Col md={5} lg={4}>
        <Stack gap={2} className="mb-2">
          <Form.Control
            placeholder="Search names"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <Stack direction="horizontal" gap={2}>
            <Form.Select size="sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
              <option value="">Any tag</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </Form.Select>
            <Form.Check
              type="switch"
              id="explorer-starred"
              label="Starred"
              checked={starred}
              onChange={(e) => setStarred(e.target.checked)}
            />
          </Stack>
        </Stack>
        {data.length === 0 ? (
          <p className="text-muted">{filtering ? "Nothing matches." : "No synced documents yet."}</p>
        ) : (
          <Tree
            // reopen everything while filtering so the matches are visible
            key={filtering ? "filtered" : "all"}
            data={data}
            openByDefault={filtering}
            width="100%"
            height={640}
            rowHeight={32}
            indent={20}
            disableDrag
            disableDrop
            disableEdit
            onSelect={(sel) => setSelected(sel.length ? sel[0].data : null)}
          >
            {NodeRow}
          </Tree>
        )}
      </Col>
      <Col md={7} lg={8}>
        {selected ? (
          <Detail key={selected.id} id={selected.id} dev={dev} />
        ) : (
          <p className="text-muted">Select a document or folder to see its details.</p>
        )}
      </Col>
    </Row>
  );
}
