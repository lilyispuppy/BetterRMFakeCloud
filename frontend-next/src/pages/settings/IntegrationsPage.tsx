import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import type { Integration } from "../../api/types";
import { Button, Card, ErrorNote, Field, Loading, PageHeader } from "../../components/ui";
import { useResource } from "../../lib/useResource";

const PROVIDERS: Record<string, string> = {
  localfs: "Directory in file system",
  ftp: "FTP",
  webdav: "WebDAV",
  dropbox: "Dropbox",
  webhook: "Messaging webhook",
  ics: "ICS calendar",
};

interface Form {
  name: string;
  provider: string;
  address: string;
  username: string;
  password: string;
  path: string;
  accesstoken: string;
  endpoint: string;
  activetransfers: boolean;
  insecure: boolean;
}

const blank: Form = {
  name: "",
  provider: "localfs",
  address: "",
  username: "",
  password: "",
  path: "",
  accesstoken: "",
  endpoint: "",
  activetransfers: false,
  insecure: false,
};

const fromIntegration = (i: Integration): Form => ({
  name: i.Name,
  provider: i.Provider,
  address: i.Address ?? "",
  username: i.Username ?? "",
  password: i.Password ?? "",
  path: i.Path ?? "",
  accesstoken: i.Accesstoken ?? "",
  endpoint: i.Endpoint ?? "",
  activetransfers: i.ActiveTransfers ?? false,
  insecure: i.Insecure ?? false,
});

/** Only the fields the chosen provider uses go to the server. */
function payload(f: Form) {
  const out: Record<string, unknown> = { name: f.name.trim(), provider: f.provider };
  const p = f.provider;
  if (p === "ftp" || p === "webdav" || p === "ics") out.address = f.address;
  if (p === "ftp" || p === "webdav") {
    out.username = f.username;
    out.password = f.password;
  }
  if (p === "ftp") out.activetransfers = f.activetransfers;
  if (p === "ics") out.insecure = f.insecure;
  if (p === "localfs") out.path = f.path;
  if (p === "dropbox") out.accesstoken = f.accesstoken;
  if (p === "webhook") out.endpoint = f.endpoint;
  return out;
}

function IntegrationForm({ initial, editing, onDone, onCancel }: { initial: Form; editing: string | null; onDone(): void; onCancel(): void }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const p = form.provider;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError(new Error("A name is required."));
    setBusy(true);
    setError(null);
    try {
      await api(editing ? `integrations/${editing}` : "integrations", { method: editing ? "PUT" : "POST", body: payload(form) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <form onSubmit={submit} autoComplete="off" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{editing ? "Edit integration" : "New integration"}</h2>
        <Field id="int-name" label="Name" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <div className="flex flex-col gap-1">
          <label htmlFor="int-provider" className="text-sm font-medium">
            Provider
          </label>
          <select id="int-provider" value={p} onChange={(e) => set("provider", e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-3">
            {Object.entries(PROVIDERS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(p === "ftp" || p === "webdav") && <Field id="int-address" label="Address" placeholder="Server URL" value={form.address} onChange={(e) => set("address", e.target.value)} />}
        {p === "ics" && <Field id="int-ics" label="ICS URL" placeholder="https://example.com/calendar.ics" value={form.address} onChange={(e) => set("address", e.target.value)} />}
        {(p === "ftp" || p === "webdav") && (
          <>
            <Field id="int-user" label="Username" value={form.username} onChange={(e) => set("username", e.target.value)} />
            <Field id="int-pass" label="Password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
          </>
        )}
        {p === "ftp" && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={form.activetransfers} onChange={(e) => set("activetransfers", e.target.checked)} />
            Use active transfers
          </label>
        )}
        {p === "ics" && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={form.insecure} onChange={(e) => set("insecure", e.target.checked)} />
            Ignore TLS certificate errors
          </label>
        )}
        {p === "localfs" && <Field id="int-path" label="Path" value={form.path} onChange={(e) => set("path", e.target.value)} />}
        {p === "dropbox" && <Field id="int-token" label="Access token" value={form.accesstoken} onChange={(e) => set("accesstoken", e.target.value)} />}
        {p === "webhook" && <Field id="int-endpoint" label="Endpoint" placeholder="https://automation.example.com/webhook/…" value={form.endpoint} onChange={(e) => set("endpoint", e.target.value)} />}
        <div className="whitespace-pre-wrap">
          <ErrorNote error={error} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}

export function IntegrationsPage() {
  const list = useResource("integrations", (signal) => api<Integration[] | null>("integrations", { signal }));
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function remove(i: Integration) {
    if (!window.confirm(`Delete the integration “${i.Name}”?`)) return;
    setError(null);
    try {
      await api(`integrations/${i.ID}`, { method: "DELETE" });
      list.reload();
    } catch (e) {
      setError(e);
    }
  }

  const items = list.data ?? [];

  return (
    <>
      <PageHeader title="Integrations">
        <Button variant="primary" onClick={() => setEditing({ id: null, form: blank })}>
          New integration
        </Button>
      </PageHeader>

      {editing && (
        <IntegrationForm
          key={editing.id ?? "new"}
          initial={editing.form}
          editing={editing.id}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}

      <ErrorNote error={list.error ?? error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="py-6 text-muted">No integrations yet. Add one to send documents to a cloud service or read a calendar.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {items.map((i) => (
            <li key={i.ID} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{i.Name}</p>
                <p className="text-sm text-muted">{PROVIDERS[i.Provider] ?? i.Provider}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setEditing({ id: i.ID, form: fromIntegration(i) })}>Edit</Button>
                <Button variant="danger" onClick={() => void remove(i)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
