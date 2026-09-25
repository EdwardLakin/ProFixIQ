"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";

type StatusVehicle = { name: string | null; vin: string | null; matched: boolean };

type StatusResponse = {
  ok: boolean;
  connected: boolean;
  connection?: {
    id: string;
    status: string;
    connectedAt: string;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
  vehicles?: StatusVehicle[];
  error?: string;
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-soft)]";

export default function FleetGeotabConnectCard({ fleetId }: { fleetId: string }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/fleet/trackers/geotab/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId }),
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as StatusResponse;

      if (!res.ok) {
        throw new Error(json.error || "Failed to load Geotab status.");
      }

      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Geotab status.");
    } finally {
      setLoading(false);
    }
  }, [fleetId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/fleet/trackers/geotab/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetId,
          database,
          username,
          password,
          server: server.trim() || undefined,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to connect to Geotab.");
      }

      setPassword("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Geotab.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/fleet/trackers/geotab/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to sync Geotab vehicles.");
      }

      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync Geotab vehicles.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/fleet/trackers/geotab/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to disconnect Geotab.");
      }

      setDatabase("");
      setUsername("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Geotab.");
    } finally {
      setBusy(false);
    }
  }

  const connection = status?.connected ? status.connection : null;
  const connected = Boolean(connection);

  return (
    <div className={`${panel} space-y-5 p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Geotab</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            Connect this Fleet&apos;s own MyGeotab database to pull its vehicles in
            and match them to units enrolled in this Fleet workspace by VIN.
            Odometer and fault code ingestion are a follow-up, not yet wired
            in.
          </p>
        </div>

        <div className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
          {loading ? "Checking…" : connected ? "Connected" : "Not connected"}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {!connected ? (
        <form onSubmit={handleConnect} className="space-y-3">
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Database
            <input
              type="text"
              required
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
              placeholder="mycompany"
            />
          </label>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Username
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
            />
          </label>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Server (advanced, optional)
            <input
              type="text"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
              placeholder="my.geotab.com"
            />
            <span className="mt-1 block font-normal text-[color:var(--theme-text-muted)]">
              Only needed for a regional or government Geotab deployment.
              Leave blank for my.geotab.com.
            </span>
          </label>
          <Button type="submit" disabled={busy || loading}>
            {busy ? "Connecting…" : "Connect Geotab"}
          </Button>
        </form>
      ) : (
        <>
          <div className="space-y-1 text-sm text-[color:var(--theme-text-secondary)]">
            <div>
              <span className="text-[color:var(--theme-text-muted)]">Status:</span>{" "}
              {connection!.status}
            </div>
            <div>
              <span className="text-[color:var(--theme-text-muted)]">Connected:</span>{" "}
              {new Date(connection!.connectedAt).toLocaleString()}
            </div>
            <div>
              <span className="text-[color:var(--theme-text-muted)]">Last sync:</span>{" "}
              {connection!.lastSyncAt
                ? new Date(connection!.lastSyncAt).toLocaleString()
                : "—"}
            </div>
            <div>
              <span className="text-[color:var(--theme-text-muted)]">Last error:</span>{" "}
              {connection!.lastError || "—"}
            </div>
          </div>

          {status?.vehicles?.length ? (
            <div className="divide-y divide-[color:var(--theme-border-soft)] rounded-xl border border-[color:var(--theme-border-soft)]">
              {status.vehicles.map((vehicle, index) => (
                <div
                  key={`${vehicle.name}-${index}`}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{vehicle.name || "Unnamed vehicle"}</span>
                  <span className="text-xs text-[color:var(--theme-text-muted)]">
                    {vehicle.matched ? "Linked to unit" : "Not matched by VIN"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[color:var(--theme-text-muted)]">
              No vehicles synced yet.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSync} disabled={busy || loading}>
              {busy ? "Syncing…" : "Sync Vehicles"}
            </Button>
            <Button onClick={handleDisconnect} disabled={busy || loading} variant="outline">
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
