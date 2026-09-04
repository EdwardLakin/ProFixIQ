"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { OwnerSettingsPanel } from "./OwnerSettingsPanels";

const CAPABILITIES = [
  "technician_copilot_text",
  "technician_copilot_documentation",
  "technician_copilot_voice",
] as const;
type Capability = (typeof CAPABILITIES)[number];

type CapabilityState = Record<Capability, boolean>;

type CapabilityResponse = { ok?: boolean; capabilities?: CapabilityState; error?: string };

const CAPABILITY_DETAILS: Record<Capability, { label: string; description: string }> = {
  technician_copilot_text: {
    label: "Technician CoPilot",
    description:
      "Turns on the assigned-work chat collaborator for every technician in this shop. Documentation and voice both require this to be on.",
  },
  technician_copilot_documentation: {
    label: "Silent documentation",
    description:
      "Lets the CoPilot capture observations, findings, and measurements from the conversation into the repair session automatically.",
  },
  technician_copilot_voice: {
    label: "Realtime voice",
    description:
      "Lets technicians talk to the CoPilot hands-free instead of typing. Speech is transcribed, answered, and spoken back.",
  },
};

function emptyState(): CapabilityState {
  return {
    technician_copilot_text: false,
    technician_copilot_documentation: false,
    technician_copilot_voice: false,
  };
}

export default function TechnicianCopilotCapabilitiesSection({
  isUnlocked,
}: {
  isUnlocked: boolean;
}) {
  const [saved, setSaved] = useState<CapabilityState | null>(null);
  const [draft, setDraft] = useState<CapabilityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings/technician-copilot", {
          cache: "no-store",
        });
        const payload = (await response
          .json()
          .catch(() => null)) as CapabilityResponse | null;
        if (!response.ok || !payload?.capabilities) {
          throw new Error(
            payload?.error || "Unable to load Technician CoPilot settings",
          );
        }
        if (active) {
          setSaved(payload.capabilities);
          setDraft(payload.capabilities);
        }
      } catch (error) {
        if (active) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to load Technician CoPilot settings",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const dirty =
    !!draft && !!saved && CAPABILITIES.some((key) => draft[key] !== saved[key]);

  async function save() {
    if (!draft || !isUnlocked) return;
    setSaving(true);
    try {
      const response = await fetch("/api/settings/technician-copilot", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as CapabilityResponse | null;
      if (!response.ok || !payload?.capabilities) {
        throw new Error(
          payload?.error || "Unable to save Technician CoPilot settings",
        );
      }
      setSaved(payload.capabilities);
      setDraft(payload.capabilities);
      toast.success("Technician CoPilot settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save Technician CoPilot settings",
      );
    } finally {
      setSaving(false);
    }
  }

  const current = draft ?? emptyState();

  return (
    <OwnerSettingsPanel
      id="technician-copilot-controls"
      tone="secondary"
      title="Technician CoPilot"
      description="Turn the assigned-work chat, silent documentation, and hands-free voice collaborator on for this shop."
      action={
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={!isUnlocked || loading || saving || !dirty}
        >
          {saving ? "Saving…" : "Save CoPilot settings"}
        </Button>
      }
    >
      <div className="space-y-3">
        {CAPABILITIES.map((capability) => {
          const details = CAPABILITY_DETAILS[capability];
          const checked = current[capability];
          const requiresText =
            capability !== "technician_copilot_text" && !current.technician_copilot_text;
          return (
            <label
              key={capability}
              className="flex items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, [capability]: event.target.checked }
                      : current,
                  )
                }
                disabled={!isUnlocked || loading || saving}
                className="mt-0.5 h-4 w-4 accent-[color:var(--brand-accent,#E39A6E)]"
              />
              <span>
                <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {details.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                  {details.description}
                </span>
                {requiresText ? (
                  <span className="mt-1 block text-[11px] font-semibold text-amber-500">
                    Needs Technician CoPilot turned on above to take effect.
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-[color:var(--theme-text-secondary)]">
        These settings apply shop-wide. A per-technician override still
        requires direct database access and is not exposed here yet.
      </p>
    </OwnerSettingsPanel>
  );
}
