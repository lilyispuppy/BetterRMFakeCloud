import { Alert, Badge, Container, Stack, Tab, Tabs } from "react-bootstrap";

import useFetch from "../../hooks/useFetch";
import Spinner from "../../components/Spinner";
import { useAuthState } from "../../common/useAuthContext";
import Role, { hasRole } from "../../common/Role";
import Browse from "./Browse";
import Tools from "./Tools";

function Failure({ error }) {
  // fetch rejects with the Response; 501 means the account is not on sync 1.5
  if (error.status === 501) {
    return (
      <Alert variant="info" className="mt-3">
        The explorer reads the sync 1.5 data, and this account uses an older sync version.
      </Alert>
    );
  }
  return (
    <Alert variant="danger" className="mt-3">
      <Alert.Heading>An Error Occurred</Alert.Heading>
      {`Error ${error.status}: ${error.statusText}`}
    </Alert>
  );
}

export default function Explorer() {
  const { state: { user } } = useAuthState();
  const dev = hasRole(user, Role.Dev);

  const { data: info, error: infoError } = useFetch("rm/info");
  const { data: root, error: treeError, loading } = useFetch("rm/tree");

  const error = infoError || treeError;
  if (error) {
    return (
      <Container fluid>
        <Failure error={error} />
      </Container>
    );
  }

  return (
    <Container fluid style={{ paddingTop: 8 }}>
      <Stack direction="horizontal" gap={2} className="mb-2 flex-wrap">
        <h3 className="mb-0 me-2">Explorer</h3>
        {info && (
          <>
            <Badge bg="secondary">{info.documents} documents</Badge>
            <Badge bg="secondary">{info.folders} folders</Badge>
            <Badge bg="secondary">{info.trashed} in trash</Badge>
            <Badge bg="info">generation {info.generation}</Badge>
            <Badge bg="info">schema {info.schemaVersion || "?"}</Badge>
            {dev && info.rootHash && (
              <Badge bg="dark" title="root hash"><code className="text-white">{info.rootHash.slice(0, 12)}</code></Badge>
            )}
          </>
        )}
      </Stack>

      {loading && !root ? (
        <Spinner />
      ) : (
        <Tabs defaultActiveKey="browse" className="mb-3" mountOnEnter>
          <Tab eventKey="browse" title="Browse">
            {root && <Browse root={root} dev={dev} />}
          </Tab>
          <Tab eventKey="tools" title="Tools">
            <Tools />
          </Tab>
        </Tabs>
      )}
    </Container>
  );
}
