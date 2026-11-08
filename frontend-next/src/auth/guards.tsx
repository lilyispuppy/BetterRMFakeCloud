import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthContext";
import { hasRole } from "./session";

/** Everything inside needs a signed in user. */
export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Everything inside needs the given role; others go back to Settings. */
export function RequireRole({ role }: { role: string }) {
  const { user } = useAuth();
  if (!hasRole(user, role)) return <Navigate to="/settings" replace />;
  return <Outlet />;
}
