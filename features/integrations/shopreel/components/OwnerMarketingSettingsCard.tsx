"use client";

import { useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { DEFAULT_SHOPREEL_EVENT_TYPES } from "../server/shopreelConfig";

type IntegrationState = {
  shopId: string;
  enabled: boolean;
  remoteShopId: string | null;
  shopreelBaseUrl: string;
  enabledEventTypes: string[];
  lastTestedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

const DEFAULT_EVENT_TYPES = [...DEFAULT_SHOPREEL_EVENT_TYPES];

export default function OwnerMarketingSettingsCard({
  initialState,
}: {
  initialState: IntegrationState;
}) {
  const [state, setState] = useState<IntegrationState>(initialState);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  async function saveSettings() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/shopreel/integration", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          shopId: state.shopId,
          enabled: state.enabled,
          remoteShopId: state.remoteShopId,
          shopreelBaseUrl: state.shopreelBaseUrl,
          enabledEventTypes: state.enabledEventTypes,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to save Marketing settings.");
      }

      setState(result.integration);
      setMessage("Marketing settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/shopreel/integration", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          shopId: state.shopId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to send test event.");
      }

      setMessage(result?.message || "Test event sent.");
      setState((current) => ({
        ...current,
        lastTestedAt: new Date().toISOString(),
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send test event.");
    } finally {
      setTesting(false);
    }
  }

  function toggleEventType(eventType: string) {
    setState((current) => {
      const exists = current.enabledEventTypes.includes(eventType);
      return {
        ...current,
        enabledEventTypes: exists
          ? current.enabledEventTypes.filter((value) => value !== eventType)
          : [...current.enabledEventTypes, eventType],
      };
    });
  }

  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">ShopReel Marketing Sync</h2>
        <p className="text-sm text-[color:var(--theme-text-secondary)]">
          Owner-only controls for automated ProFixIQ → ShopReel story syncing.
        </p>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-3">
        <div>
          <div className="font-medium text-[color:var(--theme-text-primary)]">Enable marketing automation</div>
          <div className="text-sm text-[color:var(--theme-text-muted)]">
            Allow ProFixIQ to send sanitized story events to ShopReel.
          </div>
        </div>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(event) =>
            setState((current) => ({
              ...current,
              enabled: event.target.checked,
            }))
          }
        />
      </label>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[color:var(--theme-text-primary)]">ShopReel base URL</label>
        <input
          className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
          value={state.shopreelBaseUrl}
          onChange={(event) =>
            setState((current) => ({
              ...current,
              shopreelBaseUrl: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-[color:var(--theme-text-primary)]">Remote ShopReel shop ID</label>
        <input
          className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
          placeholder="Optional until ShopReel mapping is wired"
          value={state.remoteShopId ?? ""}
          onChange={(event) =>
            setState((current) => ({
              ...current,
              remoteShopId: event.target.value.trim() || null,
            }))
          }
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">Enabled event types</div>
        <div className="grid gap-2">
          {DEFAULT_EVENT_TYPES.map((eventType) => (
            <label
              key={eventType}
              className="flex items-center justify-between rounded-md border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
            >
              <span>{eventType}</span>
              <input
                type="checkbox"
                checked={state.enabledEventTypes.includes(eventType)}
                onChange={() => toggleEventType(eventType)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-2 text-sm text-[color:var(--theme-text-secondary)]">
        <div>Last tested: {state.lastTestedAt ?? "Never"}</div>
        <div>Last success: {state.lastSuccessAt ?? "Never"}</div>
        <div>Last error: {state.lastErrorAt ?? "None"}</div>
        <div>Error message: {state.lastErrorMessage ?? "None"}</div>
      </div>

      {message ? (
        <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
        <Button onClick={sendTest} disabled={testing || !state.enabled}>
          {testing ? "Sending..." : "Send test event"}
        </Button>
      </div>
    </div>
  );
}
