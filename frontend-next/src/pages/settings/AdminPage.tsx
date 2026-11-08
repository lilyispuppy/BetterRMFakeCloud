import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import type { UserSummary } from "../../api/types";
import { Button, Card, ErrorNote, Field, Loading, PageHeader } from "../../components/ui";
import { useResource } from "../../lib/useResource";

interface Editing {
  /** null when adding */
  id: string | null;
  email: string;
  dev: boolean;
}

function UserForm({ initial, onDone, onCancel }: { initial: Editing; onDone(): void; onCancel(): void }) {
  const adding = initial.id === null;
  const [id, setId] = useState(initial.id ?? "");
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState("");
  const [dev, setDev] = useState(initial.dev);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (adding && (!id.trim() || !email.trim() || !password)) return setError(new Error("A user id, an email and a password are required."));
    if (!email.trim()) return setError(new Error("An email is required."));
    setBusy(true);
    setError(null);
    try {
      if (adding) await api("users", { method: "POST", body: { userid: id.trim(), email: email.trim(), newpassword: password } });
      else await api("users", { method: "PUT", body: { userid: initial.id, email: email.trim(), newpassword: password, dev } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <form onSubmit={submit} autoComplete="off" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{adding ? "New user" : `Edit ${initial.id}`}</h2>
        {adding && <Field id="u-id" label="User ID" value={id} onChange={(e) => setId(e.target.value)} />}
        <Field id="u-email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          id="u-pass"
          label={adding ? "Password" : "New password (leave empty to keep the current one)"}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {!adding && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={dev} onChange={(e) => setDev(e.target.checked)} />
            Developer features
          </label>
        )}
        <ErrorNote error={error} />
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

export function AdminPage() {
  const users = useResource("users", (signal) => api<UserSummary[] | null>("users", { signal }));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function remove(u: UserSummary) {
    if (!window.confirm(`Delete the user “${u.userid}”? Their documents are not deleted.`)) return;
    setError(null);
    try {
      await api(`users/${u.userid}`, { method: "DELETE" });
      users.reload();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <>
      <PageHeader title="Users">
        <Button variant="primary" onClick={() => setEditing({ id: null, email: "", dev: false })}>
          New user
        </Button>
      </PageHeader>

      {editing && (
        <UserForm
          key={editing.id ?? "new"}
          initial={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            users.reload();
          }}
        />
      )}

      <ErrorNote error={users.error ?? error} />
      {users.loading && !users.data ? (
        <Loading />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {(users.data ?? []).map((u) => (
            <li key={u.userid} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{u.email}</span>
                  {u.isAdmin && <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">Admin</span>}
                  {u.dev && <span className="rounded bg-line px-2 py-0.5 text-xs">Dev</span>}
                </p>
                <p className="text-sm text-muted">
                  {u.userid} · {u.deviceCount} {u.deviceCount === 1 ? "device" : "devices"} · {u.integrationCount}{" "}
                  {u.integrationCount === 1 ? "integration" : "integrations"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setEditing({ id: u.userid, email: u.email, dev: u.dev })}>Edit</Button>
                <Button variant="danger" onClick={() => void remove(u)}>
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
