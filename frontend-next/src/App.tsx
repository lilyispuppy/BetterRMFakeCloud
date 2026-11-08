import { Navigate, Route, Routes, useParams } from "react-router";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireRole } from "./auth/guards";
import { AppShell } from "./components/AppShell";
import { LibraryPage } from "./pages/library/LibraryPage";
import { LoginPage } from "./pages/Login";
import { NotFound } from "./pages/NotFound";
import { ScreenSharePage } from "./pages/screenshare/ScreenSharePage";
import { AdminPage } from "./pages/settings/AdminPage";
import { ConnectPage } from "./pages/settings/ConnectPage";
import { DevicesPage } from "./pages/settings/DevicesPage";
import { ExplorerPage } from "./pages/settings/ExplorerPage";
import { IntegrationsPage } from "./pages/settings/IntegrationsPage";
import { LogsPage } from "./pages/settings/LogsPage";
import { ProfilePage } from "./pages/settings/ProfilePage";
import { SettingsHome, SettingsLayout } from "./pages/settings/SettingsLayout";

function LegacyDocuments() {
  const { itemId } = useParams();
  return <Navigate to={itemId ? `/library/${itemId}` : "/library"} replace />;
}

/** Where the legacy app's addresses live now, so old bookmarks and pairing links keep working. */
const legacyRedirects: [string, string][] = [
  ["/devices", "/settings/devices"],
  ["/profile", "/settings/profile"],
  ["/integrations", "/settings/integrations"],
  ["/connect", "/settings/devices/connect"],
  ["/pair", "/settings/devices/connect"],
  ["/pair/app", "/settings/devices/connect"],
  ["/explorer", "/settings/developer/explorer"],
  ["/logs", "/settings/developer/logs"],
  ["/admin", "/settings/admin"],
];

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/library" replace />} />
            <Route path="library/:itemId?" element={<LibraryPage />} />
            <Route path="screenshare" element={<ScreenSharePage />} />

            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SettingsHome />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="devices/connect" element={<ConnectPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route element={<RequireRole role="Dev" />}>
                <Route path="developer/logs" element={<LogsPage />} />
                <Route path="developer/explorer" element={<ExplorerPage />} />
              </Route>
              <Route element={<RequireRole role="Admin" />}>
                <Route path="admin" element={<AdminPage />} />
              </Route>
            </Route>

            <Route path="documents/:itemId?" element={<LegacyDocuments />} />
            {legacyRedirects.map(([from, to]) => (
              <Route key={from} path={from} element={<Navigate to={to} replace />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
