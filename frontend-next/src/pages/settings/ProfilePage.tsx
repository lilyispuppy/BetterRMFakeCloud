import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Button, Card, ErrorNote, Field, PageHeader } from "../../components/ui";

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current || !next || !confirm) return setError(new Error("Enter your current password, a new one, and the new one again. All three are required."));
    if (next !== confirm) return setError(new Error("The confirmation does not match the new password."));
    setBusy(true);
    setError(null);
    try {
      await api("profile", {
        method: "POST",
        body: { userid: user?.id, currentPassword: current, newPassword: next, confirmNewPassword: confirm },
      });
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" />
      <Card className="mb-6">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="font-medium">{user?.email || user?.id}</p>
        {user?.email && user.id !== user.email && <p className="text-sm text-muted">User ID {user.id}</p>}
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Change password</h2>
      <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
        <Field id="current" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field id="new" label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Field id="confirm" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorNote error={error} />
        <p className="text-sm text-muted">You will be signed out afterwards, and sign in again with the new password.</p>
        <Button type="submit" variant="primary" disabled={busy}>
          Change password
        </Button>
      </form>
    </>
  );
}
