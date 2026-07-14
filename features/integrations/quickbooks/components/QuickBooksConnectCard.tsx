"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import  Card  from "@shared/components/ui/Card";

type StatusResponse = {
  ok: boolean;
  connected: boolean;
  connection?: {
    id: string;
    realmId: string;
    environment: "sandbox" | "production";
    connectedAt: string;
    isActive: boolean;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
  error?: string;
};

export default function QuickBooksConnectCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/quickbooks/status", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as StatusResponse;

      if (!res.ok) {
        throw new Error(json.error || "Failed to load QuickBooks status.");
      }

      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load QuickBooks status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleConnect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/quickbooks/connect", {
        method: "POST",
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        authorizeUrl?: string;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.authorizeUrl) {
        throw new Error(json.error || "Failed to start QuickBooks connection.");
      }

      window.location.href = json.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start QuickBooks connection.");
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/quickbooks/disconnect", {
        method: "POST",
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to disconnect QuickBooks.");
      }

      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect QuickBooks.");
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.connected && status.connection);

  return (
    <Card className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-[color:var(--theme-text-primary)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">QuickBooks Online</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Connect your shop to QuickBooks and push finalized invoices into accounting.
          </p>
        </div>

        <div className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)]">
          {loading ? "Checking…" : connected ? "Connected" : "Not connected"}
        </div>
      </div>

      {connected && status?.connection ? (
        <div className="mb-4 space-y-1 text-sm text-[color:var(--theme-text-secondary)]">
          <div>
            <span className="text-[color:var(--theme-text-secondary)]">Realm ID:</span>{" "}
            {status.connection.realmId}
          </div>
          <div>
            <span className="text-[color:var(--theme-text-secondary)]">Environment:</span>{" "}
            {status.connection.environment}
          </div>
          <div>
            <span className="text-[color:var(--theme-text-secondary)]">Connected:</span>{" "}
            {new Date(status.connection.connectedAt).toLocaleString()}
          </div>
          <div>
            <span className="text-[color:var(--theme-text-secondary)]">Last sync:</span>{" "}
            {status.connection.lastSyncAt
              ? new Date(status.connection.lastSyncAt).toLocaleString()
              : "—"}
          </div>
          <div>
            <span className="text-[color:var(--theme-text-secondary)]">Last error:</span>{" "}
            {status.connection.lastError || "—"}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {!connected ? (
          <Button onClick={handleConnect} disabled={busy || loading}>
            {busy ? "Connecting…" : "Connect QuickBooks"}
          </Button>
        ) : (
          <>
            <Button onClick={() => void loadStatus()} disabled={busy || loading}>
              Refresh Status
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={busy || loading}
              className="border border-[color:var(--theme-border-soft)] bg-transparent hover:bg-[color:var(--theme-surface-subtle)]"
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}