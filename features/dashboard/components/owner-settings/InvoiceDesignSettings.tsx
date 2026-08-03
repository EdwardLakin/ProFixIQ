"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import {
  DEFAULT_INVOICE_DOCUMENT_SETTINGS,
  INVOICE_PALETTES,
  INVOICE_TEMPLATES,
  type InvoiceDocumentSettings,
} from "@/features/invoices/lib/invoiceDocumentTheme";
import { OwnerSettingsPanel } from "./OwnerSettingsPanels";

type Props = {
  shopId: string | null;
  isUnlocked: boolean;
  onSaved?: () => void;
};

const selectClass =
  "w-full rounded-md border border-border bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none disabled:opacity-50";

export default function InvoiceDesignSettings({
  shopId,
  isUnlocked,
  onSaved,
}: Props) {
  const [settings, setSettings] = useState<InvoiceDocumentSettings>(
    DEFAULT_INVOICE_DOCUMENT_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/branding/invoice-design", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(body?.error || "Failed to load invoice design");
        if (active && body?.settings)
          setSettings(body.settings as InvoiceDocumentSettings);
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load invoice design",
        ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof InvoiceDocumentSettings>(
    key: K,
    value: InvoiceDocumentSettings[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  async function save() {
    if (!shopId || !isUnlocked) return;
    setSaving(true);
    try {
      const response = await fetch("/api/branding/invoice-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, settings }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error || "Failed to save invoice design");
      if (body?.settings) setSettings(body.settings as InvoiceDocumentSettings);
      setDirty(false);
      onSaved?.();
      toast.success("Invoice design saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save invoice design",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <OwnerSettingsPanel
      id="invoice-document-design"
      tone="secondary"
      title="Invoice design"
      description="Choose one of 30 professionally constrained template and palette combinations."
      action={
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!isUnlocked || loading || saving || !dirty}
        >
          {saving ? "Saving..." : dirty ? "Save design" : "Design saved"}
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-[color:var(--theme-text-secondary)]">
            Layout
          </span>
          <select
            className={selectClass}
            value={settings.templateId}
            disabled={!isUnlocked || loading}
            onChange={(event) =>
              update(
                "templateId",
                event.target.value as InvoiceDocumentSettings["templateId"],
              )
            }
          >
            {INVOICE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[color:var(--theme-text-muted)]">
            {
              INVOICE_TEMPLATES.find(
                (template) => template.id === settings.templateId,
              )?.description
            }
          </p>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-[color:var(--theme-text-secondary)]">
            Color palette
          </span>
          <select
            className={selectClass}
            value={settings.paletteId}
            disabled={!isUnlocked || loading}
            onChange={(event) =>
              update(
                "paletteId",
                event.target.value as InvoiceDocumentSettings["paletteId"],
              )
            }
          >
            {INVOICE_PALETTES.map((palette) => (
              <option key={palette.id} value={palette.id}>
                {palette.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5 pt-1">
            {Object.values(
              INVOICE_PALETTES.find(
                (palette) => palette.id === settings.paletteId,
              )?.colors ?? {},
            ).map((color) => (
              <span
                key={color}
                className="h-5 w-10 rounded border border-[color:var(--theme-border-soft)]"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-[color:var(--theme-text-secondary)]">
            Logo size
          </span>
          <select
            className={selectClass}
            value={settings.logoSize}
            disabled={!isUnlocked || loading}
            onChange={(event) =>
              update(
                "logoSize",
                event.target.value as InvoiceDocumentSettings["logoSize"],
              )
            }
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-[color:var(--theme-text-secondary)]">
            Logo alignment
          </span>
          <select
            className={selectClass}
            value={settings.logoAlignment}
            disabled={!isUnlocked || loading}
            onChange={(event) =>
              update(
                "logoAlignment",
                event.target.value as InvoiceDocumentSettings["logoAlignment"],
              )
            }
          >
            <option value="left">Left</option>
            <option value="center">Centered</option>
          </select>
        </label>
        <label className="space-y-1.5 text-sm md:col-span-2">
          <span className="flex justify-between text-xs text-[color:var(--theme-text-secondary)]">
            <span>Logo scale</span>
            <span>{Math.round(settings.logoZoom * 100)}%</span>
          </span>
          <input
            className="w-full accent-[color:var(--accent-copper)]"
            type="range"
            min="75"
            max="200"
            step="5"
            value={Math.round(settings.logoZoom * 100)}
            disabled={!isUnlocked || loading}
            onChange={(event) =>
              update("logoZoom", Number(event.target.value) / 100)
            }
          />
          <p className="text-[11px] text-[color:var(--theme-text-muted)]">
            Increase this for square logos with transparent padding.
          </p>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs text-[color:var(--theme-text-secondary)]">
            Line detail
          </span>
          <select
            className={selectClass}
            value={settings.detailDensity}
            disabled={!isUnlocked || loading}
            onChange={(event) =>
              update(
                "detailDensity",
                event.target.value as InvoiceDocumentSettings["detailDensity"],
              )
            }
          >
            <option value="compact">Compact</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]">
          <input
            type="checkbox"
            checked={settings.showNarratives}
            disabled={!isUnlocked || loading}
            onChange={(event) => update("showNarratives", event.target.checked)}
          />
          Show complaint, cause, and correction
        </label>
      </div>
    </OwnerSettingsPanel>
  );
}
