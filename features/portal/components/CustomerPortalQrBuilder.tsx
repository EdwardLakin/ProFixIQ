"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  LayoutTemplate,
  Loader2,
  Palette,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Settings2,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_QR_PRINT_SETTINGS,
  QR_PRINT_COLOR_PRESETS,
  QR_PRINT_FONT_OPTIONS,
  normalizeQrPrintSettings,
  qrPrintFontFamily,
  type QrPrintPaperTone,
  type QrPrintSettings,
  type QrPrintSize,
} from "@/features/portal/lib/qrPrintSettings";

type Campaign = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  allow_booking: boolean;
  scan_count: number;
  verified_count: number;
  print_settings: QrPrintSettings;
};

type EditableField =
  | "brandName"
  | "header"
  | "title"
  | "accentTitle"
  | "instruction"
  | "footer";

const PAPER_TONES: Record<
  QrPrintPaperTone,
  { label: string; note: string; color: string }
> = {
  bright: { label: "Bright white", note: "Premium", color: "#ffffff" },
  soft: { label: "Soft white", note: "Classic", color: "#f7f3ea" },
  kraft: { label: "Kraft", note: "Natural", color: "#d8c09a" },
};

const PRINT_SIZES: Record<
  QrPrintSize,
  { label: string; dimensions: string; ratio: string }
> = {
  letter: { label: "Letter", dimensions: "8.5 × 11 in", ratio: "8.5 / 11" },
  "five-seven": { label: "5 × 7", dimensions: "5 × 7 in", ratio: "5 / 7" },
  counter: { label: "Counter card", dimensions: "4 × 6 in", ratio: "4 / 6" },
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)] outline-none transition focus:border-[var(--accent-copper)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent-copper)_18%,transparent)]";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-3">
      <span>
        <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--theme-text-muted)]">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accent-copper)]"
      />
    </label>
  );
}

function EditablePreviewField({
  field,
  selected,
  onSelect,
  className,
  children,
}: {
  field: EditableField;
  selected: boolean;
  onSelect: (field: EditableField) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(field)}
      title="Click to edit"
      className={`group relative rounded-lg border border-dashed px-2 py-1 text-inherit outline-none transition ${
        selected
          ? "border-current bg-black/[0.04] ring-2 ring-current/15"
          : "border-transparent hover:border-current/35 hover:bg-black/[0.03]"
      } ${className ?? ""}`}
    >
      {children}
      <Pencil className="absolute -right-2 -top-2 hidden h-4 w-4 rounded-full bg-white p-0.5 text-slate-700 shadow group-hover:block" />
    </button>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
      {label}
      <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9A-Fa-f]{6}"
          className="min-w-0 flex-1 bg-transparent text-xs font-mono uppercase text-[color:var(--theme-text-primary)] outline-none"
        />
      </span>
    </label>
  );
}

export default function CustomerPortalQrBuilder() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [shopName, setShopName] = useState("Your shop");
  const [shopLogoUrl, setShopLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [name, setName] = useState("Front desk");
  const [allowBooking, setAllowBooking] = useState(true);
  const [settings, setSettings] = useState<QrPrintSettings>(
    DEFAULT_QR_PRINT_SETTINGS,
  );
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [editorTab, setEditorTab] = useState<"content" | "style">("content");
  const [selectedField, setSelectedField] = useState<EditableField | null>(
    null,
  );
  const [quantity, setQuantity] = useState("25");
  const [cropMarks, setCropMarks] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/portal/qr/campaign", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        campaign?: Campaign;
        shopName?: string;
        shopLogoUrl?: string | null;
      } | null;
      if (response.ok && payload?.campaign) {
        const nextShopName = payload.shopName || "Your shop";
        const nextSettings = normalizeQrPrintSettings(
          payload.campaign.print_settings,
          {
            shopName: nextShopName,
          },
        );
        setCampaign({ ...payload.campaign, print_settings: nextSettings });
        setName(payload.campaign.name);
        setAllowBooking(payload.campaign.allow_booking);
        setSettings(nextSettings);
        setShopName(nextShopName);
        setShopLogoUrl(payload.shopLogoUrl || null);
        setSavedSnapshot(
          JSON.stringify({
            name: payload.campaign.name,
            allowBooking: payload.campaign.allow_booking,
            settings: nextSettings,
          }),
        );
      } else {
        toast.error("Customer portal campaign could not be loaded.");
      }
      setLoading(false);
    })();
  }, []);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ name, allowBooking, settings }),
    [allowBooking, name, settings],
  );
  const isDirty = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const baseUrl =
    typeof window === "undefined"
      ? "https://profixiq.com"
      : window.location.origin;
  const enrollmentUrl = campaign
    ? `${baseUrl}/portal/join/${campaign.slug}`
    : "";
  const qrSrc = campaign
    ? `/api/portal/qr/${encodeURIComponent(campaign.slug)}`
    : "";
  const conversion = useMemo(() => {
    if (!campaign?.scan_count) return 0;
    return Math.round((campaign.verified_count / campaign.scan_count) * 100);
  }, [campaign]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

  const updateSetting = <K extends keyof QrPrintSettings>(
    key: K,
    value: QrPrintSettings[K],
  ) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  const selectPreviewField = (field: EditableField) => {
    setEditorTab("content");
    setSelectedField(field);
    window.requestAnimationFrame(() => {
      document.getElementById(`qr-editor-${field}`)?.focus();
    });
  };

  async function update(options: { rotate?: boolean } = {}) {
    if (!campaign || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/portal/qr/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          name,
          allowBooking,
          printSettings: settings,
          rotate: options.rotate,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        campaign?: Campaign;
        error?: string;
      } | null;
      if (!response.ok || !payload?.campaign) {
        throw new Error(payload?.error || "Campaign could not be saved.");
      }
      const nextSettings = normalizeQrPrintSettings(
        payload.campaign.print_settings,
        { shopName },
      );
      setCampaign({ ...payload.campaign, print_settings: nextSettings });
      setSettings(nextSettings);
      setSavedSnapshot(
        JSON.stringify({ name, allowBooking, settings: nextSettings }),
      );
      toast.success(
        options.rotate
          ? "QR code rotated. Reprint existing cards."
          : "Campaign design saved.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Campaign could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function downloadPreview() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: PAPER_TONES[settings.paperTone].color,
      });
      const link = document.createElement("a");
      link.download = `${
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") || "portal-qr"
      }-preview.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Preview downloaded.");
    } catch {
      toast.error(
        "Preview could not be downloaded. Try Print / Save PDF instead.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-[color:var(--theme-text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const paper = PAPER_TONES[settings.paperTone];
  const printSize = PRINT_SIZES[settings.size];
  const fontFamily = qrPrintFontFamily(settings.font);

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-5 px-4 py-6 text-[color:var(--theme-text-primary)] xl:px-6">
      <header className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
            Customer portal
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            QR print studio
          </h1>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
            Edit the card directly, tune the design, and create polished
            enrollment materials.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2.5 text-sm font-bold text-[color:var(--theme-text-on-accent)]"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(400px,1fr)_310px] lg:items-start">
        <aside className="space-y-4 print:hidden lg:sticky lg:top-20">
          <section className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-[var(--theme-shadow-soft)]">
            <div className="grid grid-cols-2 border-b border-[color:var(--theme-border-soft)] p-1.5">
              {(
                [
                  ["content", Type, "Content"],
                  ["style", Palette, "Style"],
                ] as const
              ).map(([tab, Icon, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEditorTab(tab)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    editorTab === tab
                      ? "bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] shadow-sm"
                      : "text-[color:var(--theme-text-muted)]"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(100vh-250px)] space-y-4 overflow-y-auto p-4">
              {editorTab === "content" ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <QrCode className="h-4 w-4 text-[var(--accent-copper)]" />{" "}
                    Campaign
                  </div>
                  <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                    Internal campaign name
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div>
                    <div className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                      Enrollment URL
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(enrollmentUrl);
                        toast.success("Enrollment link copied.");
                      }}
                      className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-left text-xs"
                    >
                      <span className="truncate">{enrollmentUrl}</span>
                      <Copy className="h-4 w-4 shrink-0" />
                    </button>
                  </div>

                  <div className="border-t border-[color:var(--theme-border-soft)] pt-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-[var(--accent-copper)]" />{" "}
                      Card copy
                    </div>
                    <div className="space-y-3">
                      {(
                        [
                          ["brandName", "Display name", settings.brandName, 60],
                          ["header", "Header", settings.header, 60],
                          ["title", "Title", settings.title, 90],
                          [
                            "accentTitle",
                            "Highlighted title",
                            settings.accentTitle,
                            90,
                          ],
                          [
                            "instruction",
                            "Scan instruction",
                            settings.instruction,
                            120,
                          ],
                          ["footer", "Footer", settings.footer, 80],
                        ] as const
                      ).map(([field, label, value, maxLength]) => (
                        <label
                          key={field}
                          className={`block rounded-xl text-xs font-semibold text-[color:var(--theme-text-secondary)] ${
                            selectedField === field
                              ? "ring-2 ring-[var(--accent-copper)]/25"
                              : ""
                          }`}
                        >
                          {label}
                          <input
                            id={`qr-editor-${field}`}
                            value={value}
                            maxLength={maxLength}
                            onFocus={() => setSelectedField(field)}
                            onChange={(event) =>
                              updateSetting(field, event.target.value)
                            }
                            className={inputClass}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <Toggle
                    checked={settings.showLogo}
                    onChange={(value) => updateSetting("showLogo", value)}
                    label="Show shop logo"
                    description={
                      shopLogoUrl
                        ? "Uses the active Brand Studio logo."
                        : "A logo can be added in Brand Studio."
                    }
                  />
                  <Toggle
                    checked={allowBooking}
                    onChange={setAllowBooking}
                    label="Allow service booking"
                    description="Customers can request service after enrollment."
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <LayoutTemplate className="h-4 w-4 text-[var(--accent-copper)]" />{" "}
                    Color theme
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {QR_PRINT_COLOR_PRESETS.map((preset) => {
                      const active =
                        settings.primaryColor === preset.primary &&
                        settings.accentColor === preset.accent &&
                        settings.footerColor === preset.footer;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setSettings((previous) => ({
                              ...previous,
                              primaryColor: preset.primary,
                              accentColor: preset.accent,
                              footerColor: preset.footer,
                            }))
                          }
                          className={`rounded-xl border p-2 text-left transition ${
                            active
                              ? "border-[var(--accent-copper)] ring-2 ring-[var(--accent-copper)]/15"
                              : "border-[color:var(--theme-border-soft)]"
                          }`}
                        >
                          <span className="flex gap-1">
                            {[preset.primary, preset.accent, preset.footer].map(
                              (color) => (
                                <span
                                  key={color}
                                  className="h-6 flex-1 rounded-md"
                                  style={{ backgroundColor: color }}
                                />
                              ),
                            )}
                          </span>
                          <span className="mt-2 block text-[11px] font-semibold">
                            {preset.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid gap-3">
                    <ColorControl
                      label="Primary text"
                      value={settings.primaryColor}
                      onChange={(value) => updateSetting("primaryColor", value)}
                    />
                    <ColorControl
                      label="Accent"
                      value={settings.accentColor}
                      onChange={(value) => updateSetting("accentColor", value)}
                    />
                    <ColorControl
                      label="Footer background"
                      value={settings.footerColor}
                      onChange={(value) => updateSetting("footerColor", value)}
                    />
                  </div>

                  <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                    Font style
                    <select
                      value={settings.font}
                      onChange={(event) =>
                        updateSetting(
                          "font",
                          event.target.value as QrPrintSettings["font"],
                        )
                      }
                      className={inputClass}
                    >
                      {QR_PRINT_FONT_OPTIONS.map((font) => (
                        <option key={font.id} value={font.id}>
                          {font.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setSettings(
                        normalizeQrPrintSettings(DEFAULT_QR_PRINT_SETTINGS, {
                          shopName,
                        }),
                      )
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2.5 text-sm font-semibold text-[color:var(--theme-text-secondary)]"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset design
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-[color:var(--theme-border-soft)] p-4">
              <button
                type="button"
                disabled={saving || !isDirty}
                onClick={() => void update()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2.5 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isDirty ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {isDirty ? "Save design" : "Saved"}
              </button>
              <button
                type="button"
                disabled={saving}
                title="Rotate QR code"
                onClick={() => {
                  if (
                    window.confirm(
                      "Rotate this code? Previously printed QR cards will stop working.",
                    )
                  ) {
                    void update({ rotate: true });
                  }
                }}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-secondary)]"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-soft)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="h-4 w-4 text-[var(--accent-copper)]" />{" "}
              Campaign activity
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Scans", campaign?.scan_count ?? 0],
                  ["Verified", campaign?.verified_count ?? 0],
                  ["Conversion", `${conversion}%`],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-[color:var(--theme-surface-inset)] p-2 text-center"
                >
                  <div className="text-lg font-semibold">{value}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-soft)] print:border-0 print:bg-white print:p-0 print:shadow-none sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Eye className="h-4 w-4 text-[var(--accent-copper)]" /> Live
                preview
              </div>
              <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                Click any outlined text on the card to edit it.
              </p>
            </div>
            <span className="rounded-full bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--theme-text-secondary)]">
              {printSize.label} · {paper.label}
            </span>
          </div>

          <div className="grid place-items-center overflow-auto rounded-2xl bg-[color:var(--theme-surface-inset)] p-4 print:block print:bg-white print:p-0 sm:p-8">
            <div
              ref={cardRef}
              className="relative w-full max-w-[430px] overflow-hidden border border-black/15 text-center shadow-2xl transition-all print:max-w-none print:rounded-none print:border-0 print:shadow-none"
              style={{
                aspectRatio: printSize.ratio,
                backgroundColor: paper.color,
                color: settings.primaryColor,
                fontFamily,
                borderRadius: settings.size === "counter" ? "1.5rem" : "0.8rem",
              }}
            >
              {cropMarks ? (
                <div
                  className="pointer-events-none absolute inset-2 z-20 border border-dashed border-black/35"
                  aria-hidden
                />
              ) : null}
              <div className="flex h-full flex-col">
                <div className="flex flex-1 flex-col items-center justify-center px-7 py-7 sm:px-10">
                  {settings.showLogo && shopLogoUrl ? (
                    <Image
                      src={shopLogoUrl}
                      alt={`${shopName} logo`}
                      width={190}
                      height={72}
                      unoptimized
                      className="mb-3 max-h-16 w-auto max-w-[220px] object-contain"
                    />
                  ) : null}
                  <EditablePreviewField
                    field="brandName"
                    selected={selectedField === "brandName"}
                    onSelect={selectPreviewField}
                    className="text-sm font-bold uppercase tracking-[0.18em]"
                  >
                    {settings.brandName}
                  </EditablePreviewField>
                  <EditablePreviewField
                    field="header"
                    selected={selectedField === "header"}
                    onSelect={selectPreviewField}
                    className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
                  >
                    {settings.header}
                  </EditablePreviewField>
                  <h2 className="mt-3 flex flex-col items-center text-[clamp(1.65rem,4.5vw,2.6rem)] font-bold leading-[0.98] tracking-[-0.045em]">
                    <EditablePreviewField
                      field="title"
                      selected={selectedField === "title"}
                      onSelect={selectPreviewField}
                    >
                      {settings.title}
                    </EditablePreviewField>
                    <EditablePreviewField
                      field="accentTitle"
                      selected={selectedField === "accentTitle"}
                      onSelect={selectPreviewField}
                      className="mt-1"
                    >
                      <span style={{ color: settings.accentColor }}>
                        {settings.accentTitle}
                      </span>
                    </EditablePreviewField>
                  </h2>
                  <div
                    className="my-4 flex w-2/3 items-center gap-2"
                    style={{ color: settings.accentColor }}
                  >
                    <span className="h-px flex-1 bg-current/45" />
                    <span className="h-2.5 w-2.5 rotate-45 border-2 border-current" />
                    <span className="h-px flex-1 bg-current/45" />
                  </div>
                  {qrSrc ? (
                    <Image
                      src={qrSrc}
                      alt="Customer portal enrollment QR code"
                      width={224}
                      height={224}
                      unoptimized
                      className="h-auto w-[54%] min-w-[150px] max-w-[225px] rounded-xl border border-black/15 bg-white p-2"
                    />
                  ) : null}
                  <EditablePreviewField
                    field="instruction"
                    selected={selectedField === "instruction"}
                    onSelect={selectPreviewField}
                    className="mt-4 max-w-[280px] text-sm font-semibold leading-5"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <ScanLine
                        className="h-4 w-4 shrink-0"
                        style={{ color: settings.accentColor }}
                      />
                      {settings.instruction}
                    </span>
                  </EditablePreviewField>
                </div>
                <div
                  className="px-6 py-4 text-white"
                  style={{ backgroundColor: settings.footerColor }}
                >
                  <EditablePreviewField
                    field="footer"
                    selected={selectedField === "footer"}
                    onSelect={selectPreviewField}
                    className="text-xs font-semibold uppercase tracking-[0.16em]"
                  >
                    {settings.footer}
                  </EditablePreviewField>
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="space-y-4 print:hidden lg:sticky lg:top-20">
          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-soft)]">
            <div className="mb-4 flex items-center gap-2 font-semibold">
              <Printer className="h-4 w-4 text-[var(--accent-copper)]" /> Print
              options
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-2 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  Size
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    Object.entries(PRINT_SIZES) as Array<
                      [QrPrintSize, (typeof PRINT_SIZES)[QrPrintSize]]
                    >
                  ).map(([id, option]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateSetting("size", id)}
                      className={`rounded-xl border px-2 py-3 text-center transition ${settings.size === id ? "border-[var(--accent-copper)] bg-[color:color-mix(in_srgb,var(--accent-copper)_8%,var(--theme-surface-panel))] ring-2 ring-[var(--accent-copper)]/15" : "border-[color:var(--theme-border-soft)]"}`}
                    >
                      <span className="block text-xs font-semibold">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-[9px] text-[color:var(--theme-text-muted)]">
                        {option.dimensions}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  Paper tone
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    Object.entries(PAPER_TONES) as Array<
                      [QrPrintPaperTone, (typeof PAPER_TONES)[QrPrintPaperTone]]
                    >
                  ).map(([id, option]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateSetting("paperTone", id)}
                      className={`overflow-hidden rounded-xl border text-center transition ${settings.paperTone === id ? "border-[var(--accent-copper)] ring-2 ring-[var(--accent-copper)]/15" : "border-[color:var(--theme-border-soft)]"}`}
                    >
                      <span
                        className="block h-10 border-b border-black/10"
                        style={{ backgroundColor: option.color }}
                      />
                      <span className="block px-1 py-2 text-[10px] font-semibold">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                Quantity
                <select
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className={inputClass}
                >
                  {[1, 10, 25, 50, 100].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <Toggle
                checked={cropMarks}
                onChange={setCropMarks}
                label="Add crop marks"
                description="Useful when trimming multiple cards."
              />

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-sm font-bold text-[color:var(--theme-text-on-accent)]"
              >
                <Printer className="h-4 w-4" /> Print / Save PDF
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void downloadPreview()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-3 text-sm font-semibold text-[color:var(--theme-text-secondary)] disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download preview
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
            <div className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--theme-surface-inset)]">
                <ScanLine className="h-4 w-4 text-[var(--accent-copper)]" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  Best results on card stock
                </div>
                <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                  Use 100–110 lb matte card stock. Your print dialog controls
                  the final {quantity}-copy run.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
