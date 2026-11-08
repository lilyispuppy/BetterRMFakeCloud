import { api } from "../../api/client";
import { Button, ErrorNote, Loading, PageHeader } from "../../components/ui";
import { useResource } from "../../lib/useResource";

export function ConnectPage() {
  const code = useResource("newcode", (signal) => api<string>("newcode", { signal }));

  return (
    <>
      <PageHeader title="Connect a device" />
      <p className="mb-6 max-w-prose text-muted">
        On the tablet, open Settings, then Account (or the cloud connection screen), and enter this code when it asks for a one-time
        code. It works once and expires after a few minutes.
      </p>
      <ErrorNote error={code.error} />
      <div className="flex flex-col items-start gap-4">
        {code.data ? (
          <p aria-label="One-time code" className="rounded-card border border-line bg-raised px-6 py-4 font-mono text-4xl tracking-[0.3em]">
            {code.data}
          </p>
        ) : code.loading ? (
          <Loading label="Getting a code" />
        ) : null}
        <Button onClick={code.reload}>New code</Button>
      </div>
    </>
  );
}
