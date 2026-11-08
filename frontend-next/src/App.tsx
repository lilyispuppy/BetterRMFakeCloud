import { Route, Routes } from "react-router";

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="text-2xl font-semibold">rmfakecloud</h1>
      <p className="mt-2 text-muted">The new web app is being built. This is the scaffold.</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">There is nothing at this address.</p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
