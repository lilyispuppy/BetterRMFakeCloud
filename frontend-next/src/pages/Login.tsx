import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Button, ErrorNote, Field } from "../components/ui";

export function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const requested = (location.state as { from?: string } | null)?.from ?? "/";
  // files shared to the app before signing in were not added; say so, and do not repeat the notice afterwards
  const sharedWhileSignedOut = requested.includes("shared=signin");
  const from = sharedWhileSignedOut ? "/library" : requested;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {sharedWhileSignedOut && <p className="text-sm text-muted">Sign in to add the files you shared, then share them again.</p>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field id="email" label="Email" type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" disabled={busy}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
