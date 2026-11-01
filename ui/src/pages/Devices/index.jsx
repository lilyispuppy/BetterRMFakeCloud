import { useEffect, useState } from "react";
import { Alert, Badge, Button, Container, Form, Stack, Table } from "react-bootstrap";
import moment from "moment";

import useFetch from "../../hooks/useFetch";
import Spinner from "../../components/Spinner";
import { useAuthState } from "../../common/useAuthContext";
import Role, { hasRole } from "../../common/Role";
import { formatDate } from "../../common/date";

const REFRESH_MS = 15000;

export default function Devices() {
  const { state: { user } } = useAuthState();
  const isAdmin = hasRole(user, Role.Admin);
  const devView = hasRole(user, Role.Dev);

  const [all, setAll] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { data: devices, error, loading } = useFetch(
    `devices${all ? "?all=1" : ""}`,
    refresh
  );

  // keep the online dots reasonably current
  useEffect(() => {
    const id = setInterval(() => setRefresh((n) => n + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <Container fluid>
        <Alert variant="danger" className="mt-3">
          <Alert.Heading>An Error Occurred</Alert.Heading>
          {`Error ${error.status}: ${error.statusText}`}
        </Alert>
      </Container>
    );
  }

  return (
    <Container fluid style={{ paddingTop: 8 }}>
      <Stack direction="horizontal" gap={3} className="mb-2">
        <h3 className="mb-0">Devices</h3>
        {isAdmin && (
          <Form.Check
            type="switch"
            id="devices-all"
            label="All users"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
        )}
        <Button className="ms-auto" variant="outline-secondary" onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </Button>
      </Stack>

      {loading && !devices ? (
        <Spinner />
      ) : !devices || !devices.length ? (
        <p className="text-muted">
          No devices seen yet. A device appears here once it has talked to the
          server; a tablet paired before this page existed shows up after its
          next sync.
        </p>
      ) : (
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Status</th>
              {all && <th>User</th>}
              <th>Name</th>
              <th>Last seen</th>
              <th>First seen</th>
              <th>Sync</th>
              {devView && <th>Device ID</th>}
              {devView && <th>IP</th>}
              {devView && <th>User agent</th>}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={`${d.userId || ""}/${d.id}`}>
                <td>
                  {d.online ? (
                    <Badge bg="success">Online</Badge>
                  ) : (
                    <Badge bg="secondary">Offline</Badge>
                  )}
                </td>
                {all && <td>{d.userId}</td>}
                <td>{d.description || <span className="text-muted">unnamed</span>}</td>
                <td title={formatDate(d.lastSeen)}>{moment(d.lastSeen).fromNow()}</td>
                <td>{formatDate(d.firstSeen)}</td>
                <td>{d.syncVersion}</td>
                {devView && <td><code>{d.id}</code></td>}
                {devView && <td>{d.lastIP}</td>}
                {devView && <td>{d.userAgent}</td>}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
}
