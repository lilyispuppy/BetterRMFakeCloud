import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../api/client";
import type { Device } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { hasRole } from "../../auth/session";
import { Button, ErrorNote, Loading, PageHeader, buttonClass } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { useResource } from "../../lib/useResource";

export function DevicesPage() {
  const { user } = useAuth();
  const isAdmin = hasRole(user, "Admin");
  const isDev = hasRole(user, "Dev");
  const [all, setAll] = useState(false);
  const devices = useResource(`devices:${all}`, (signal) => api<Device[]>("devices", { query: { all: all ? 1 : undefined }, signal }));

  return (
    <>
      <PageHeader title="Devices">
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-5" />
              All users
            </label>
          )}
          <Button onClick={devices.reload}>Refresh</Button>
          <Link to="/settings/devices/connect" className={buttonClass("primary")}>
            Connect a device
          </Link>
        </div>
      </PageHeader>

      <ErrorNote error={devices.error} />
      {devices.loading && !devices.data ? (
        <Loading />
      ) : devices.data && devices.data.length === 0 ? (
        <p className="py-6 text-muted">
          No devices seen yet. A device appears here once it has talked to the server; a tablet paired before this page existed shows up
          after its next sync.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {(devices.data ?? []).map((d) => (
            <li key={`${d.userId ?? ""}/${d.id}`} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${d.online ? "bg-green-500" : "bg-muted"}`} aria-hidden="true" />
                <span className="font-medium">{d.description || <span className="text-muted">unnamed</span>}</span>
                <span className="rounded bg-line px-2 py-0.5 text-xs">{d.online ? "Online" : "Offline"}</span>
                {d.syncVersion && <span className="text-xs text-muted">sync {d.syncVersion}</span>}
              </div>
              <div className="text-sm text-muted">
                {all && d.userId ? <>User <span className="text-ink">{d.userId}</span> · </> : null}
                Last seen {formatDate(d.lastSeen)} · first seen {formatDate(d.firstSeen)}
              </div>
              {isDev && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted">
                  <dt>ID</dt>
                  <dd className="break-all font-mono">{d.id}</dd>
                  {d.lastIP && (
                    <>
                      <dt>IP</dt>
                      <dd>{d.lastIP}</dd>
                    </>
                  )}
                  {d.userAgent && (
                    <>
                      <dt>Agent</dt>
                      <dd className="break-all">{d.userAgent}</dd>
                    </>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
