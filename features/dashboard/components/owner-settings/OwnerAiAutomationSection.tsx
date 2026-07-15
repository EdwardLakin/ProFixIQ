"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AI_AUTOMATION_CAPABILITIES,
  AI_AUTOMATION_CAPABILITY_DETAILS,
  type AiAutomationPolicy,
} from "@/features/ai/automation/types";
import { Button } from "@shared/components/ui/Button";
import { OwnerSettingsPanel } from "./OwnerSettingsPanels";

type PolicyResponse = { policy?: AiAutomationPolicy; warning?: string; error?: string };

export default function OwnerAiAutomationSection({ isUnlocked }: { isUnlocked: boolean }) {
  const [policy, setPolicy] = useState<AiAutomationPolicy | null>(null);
  const [enabled, setEnabled] = useState<AiAutomationPolicy["ownerEnabled"] | null>(null);
  const [automationPaused, setAutomationPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings/ai-automation", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as PolicyResponse | null;
        if (!response.ok || !payload?.policy) throw new Error(payload?.error || "Unable to load AI automation controls");
        if (active) {
          setPolicy(payload.policy);
          setEnabled(payload.policy.ownerEnabled);
          setAutomationPaused(payload.policy.automationPaused);
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Unable to load AI automation controls");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function save() {
    if (!enabled || !isUnlocked) return;
    setSaving(true);
    try {
      const response = await fetch("/api/settings/ai-automation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, automationPaused }),
      });
      const payload = (await response.json().catch(() => null)) as PolicyResponse | null;
      if (!response.ok || !payload?.policy) throw new Error(payload?.error || "Unable to save AI automation controls");
      setPolicy(payload.policy);
      setEnabled(payload.policy.ownerEnabled);
      setAutomationPaused(payload.policy.automationPaused);
      if (payload.warning) toast.warning(payload.warning);
      else toast.success("Automation controls saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save AI automation controls");
    } finally {
      setSaving(false);
    }
  }

  return (
    <OwnerSettingsPanel
      id="ai-automation-controls"
      tone="secondary"
      title="AI automation readiness"
      description="The assistant and learning loop are always available. Owners control only executable automation."
      action={<Button type="button" size="sm" onClick={() => void save()} disabled={!isUnlocked || loading || saving || !enabled}>{saving ? "Saving…" : "Save automation controls"}</Button>}
    >
      <label className="flex items-start gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
        <input type="checkbox" checked={automationPaused} onChange={(event) => setAutomationPaused(event.target.checked)} disabled={!isUnlocked || loading || saving} className="mt-0.5 h-4 w-4 accent-[color:var(--brand-accent,#E39A6E)]" />
        <span>
          <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">Pause all automatic execution</span>
          <span className="mt-1 block text-xs leading-5 text-[color:var(--theme-text-secondary)]">Emergency stop for automated actions. The assistant and learning history continue operating normally.</span>
        </span>
      </label>

      <div className="space-y-3">
        {AI_AUTOMATION_CAPABILITIES.map((capability) => {
          const details = AI_AUTOMATION_CAPABILITY_DETAILS[capability];
          const readiness = policy?.readiness[capability];
          const executionAvailable = policy?.executionAvailable[capability] === true;
          const ownerEnabled = enabled?.[capability] === true;
          const ready = readiness?.status === "ready";
          const canEnable = ready && executionAvailable;
          const effective = policy?.effectiveEnabled[capability] === true;
          return (
            <div key={capability} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{details.label}</span>
                    <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                      {readiness?.status === "suspended" ? "Suspended" : ready ? "Ready" : `Learning ${readiness?.readinessPercent ?? 0}%`}
                    </span>
                    {!executionAvailable ? <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">Executor not released</span> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">{details.description}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--theme-text-primary)]">
                  <input
                    type="checkbox"
                    checked={ownerEnabled}
                    onChange={(event) => setEnabled((current) => current ? { ...current, [capability]: event.target.checked } : current)}
                    disabled={!isUnlocked || loading || saving || (!ownerEnabled && !canEnable)}
                    className="h-4 w-4 accent-[color:var(--brand-accent,#E39A6E)]"
                  />
                  {effective ? "Automatic" : ownerEnabled ? "Authorized" : "Owner disabled"}
                </label>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-page)]">
                <div className="h-full rounded-full bg-[color:var(--brand-accent,#E39A6E)]" style={{ width: `${readiness?.readinessPercent ?? 0}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                {readiness?.observationCount ?? 0} shop-history observations · {readiness?.comparisonCount ?? 0} verified shadow comparisons · needs {readiness?.minimumObservationCount ?? 0} observations and {readiness?.minimumComparisonCount ?? 0} comparisons
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-[color:var(--theme-text-secondary)]">A capability becomes available only after ProFixIQ has enough recent shop history, accurate shadow comparisons, no critical failures, and a certified executor. Readiness never grants authority—the owner must still enable it.</p>
    </OwnerSettingsPanel>
  );
}
