"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";

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

export default function GeotabConnectCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/fleet/trackers/geotab/status", {
        method: "GET",
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
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/fleet/trackers/geotab/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database, username, password }),
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
      const res = await fetch("/api/fleet/trackers/geotab/sync", { method: "POST" });
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
      const res = await fetch("/api/fleet/trackers/geotab/disconnect", { method: "POST" });
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
    <Card className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-[color:var(--theme-text-primary)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Geotab</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Connect a MyGeotab database to pull vehicle location, odometer, and fault
            code data into this shop.
          </p>
        </div>

        <div className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)]">
          {loading ? "Checking…" : connected ? "Connected" : "Not connected"}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {!connected ? (
        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Database
            </label>
            <input
              type="text"
              required
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm"
              placeholder="mycompany"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--theme-text-secondary)]">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={busy || loading}>
            {busy ? "Connecting…" : "Connect Geotab"}
          </Button>
        </form>
      ) : (
        <>
          <div className="mb-4 space-y-1 text-sm text-[color:var(--theme-text-secondary)]">
            <div>
              <span className="text-[color:var(--theme-text-secondary)]">Status:</span>{" "}
              {connection!.status}
            </div>
            <div>
              <span className="text-[color:var(--theme-text-secondary)]">Connected:</span>{" "}
              {new Date(connection!.connectedAt).toLocaleString()}
            </div>
            <div>
              <span className="text-[color:var(--theme-text-secondary)]">Last sync:</span>{" "}
              {connection!.lastSyncAt
                ? new Date(connection!.lastSyncAt).toLocaleString()
                : "—"}
            </div>
            <div>
              <span className="text-[color:var(--theme-text-secondary)]">Last error:</span>{" "}
              {connection!.lastError || "—"}
            </div>
          </div>

          {status?.vehicles?.length ? (
            <div className="mb-4 divide-y divide-[color:var(--theme-border-soft)] rounded-xl border border-[color:var(--theme-border-soft)]">
              {status.vehicles.map((vehicle, index) => (
                <div
                  key={`${vehicle.name}-${index}`}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{vehicle.name || "Unnamed vehicle"}</span>
                  <span className="text-xs text-[color:var(--theme-text-secondary)]">
                    {vehicle.matched ? "Linked to vehicle record" : "Not matched by VIN"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 text-sm text-[color:var(--theme-text-secondary)]">
              No vehicles synced yet.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSync} disabled={busy || loading}>
              {busy ? "Syncing…" : "Sync Vehicles"}
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={busy || loading}
              variant="outline"
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
