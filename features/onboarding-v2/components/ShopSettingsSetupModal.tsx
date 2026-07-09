"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/features/shared/components/ui/input";
import { Button } from "@/features/shared/components/ui/Button";
import OwnerPinModal from "@/features/shared/components/OwnerPinModal";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { GuidedOnboardingSessionDetail } from "@/features/onboarding-v2/guided/types";

type CountryCode = "US" | "CA";
type SuppliesType = "percentage" | "flat";

export type OnboardingHourRow = {
  weekday: number;
  open_time: string;
  close_time: string;
  closed?: boolean;
};

type Props = {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onCompleted: (detail: GuidedOnboardingSessionDetail) => void;
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Edmonton",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Halifax",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_ONBOARDING_HOURS: OnboardingHourRow[] = [
  { weekday: 0, open_time: "08:00", close_time: "17:00", closed: true },
  { weekday: 1, open_time: "08:00", close_time: "17:00", closed: false },
  { weekday: 2, open_time: "08:00", close_time: "17:00", closed: false },
  { weekday: 3, open_time: "08:00", close_time: "17:00", closed: false },
  { weekday: 4, open_time: "08:00", close_time: "17:00", closed: false },
  { weekday: 5, open_time: "08:00", close_time: "17:00", closed: false },
  { weekday: 6, open_time: "08:00", close_time: "17:00", closed: true },
];

function asNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readJsonError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  return json.error ?? fallback;
}

async function completeStep(sessionId: string, action: "complete" | "skip") {
  const response = await fetch(`/api/onboarding-v2/guided/sessions/${encodeURIComponent(sessionId)}/steps/shop_settings/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action === "complete" ? { summary: { savedSettings: true } } : { skippedReason: "Shop settings skipped during onboarding." }),
  });
  if (!response.ok) throw new Error(await readJsonError(response, "Unable to update Shop Settings onboarding step."));
  return (await response.json()) as GuidedOnboardingSessionDetail;
}

export default function ShopSettingsSetupModal({ sessionId, open, onClose, onCompleted }: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinExpiresAt, setPinExpiresAt] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());

  const [shopName, setShopName] = useState("");
  const [country, setCountry] = useState<CountryCode>("US");
  const [timezone, setTimezone] = useState("America/New_York");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [laborRate, setLaborRate] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [shopSuppliesEnabled, setShopSuppliesEnabled] = useState(false);
  const [shopSuppliesType, setShopSuppliesType] = useState<SuppliesType>("percentage");
  const [shopSuppliesPercent, setShopSuppliesPercent] = useState("");
  const [shopSuppliesFlatAmount, setShopSuppliesFlatAmount] = useState("");
  const [shopSuppliesCapAmount, setShopSuppliesCapAmount] = useState("");
  const [hours, setHours] = useState<OnboardingHourRow[]>(DEFAULT_ONBOARDING_HOURS);
  const [useAi, setUseAi] = useState(false);
  const [requireCauseCorrection, setRequireCauseCorrection] = useState(false);
  const [requireAuthorization, setRequireAuthorization] = useState(false);
  const [autoGeneratePdf, setAutoGeneratePdf] = useState(false);
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState(false);

  const isUnlocked = useMemo(() => Boolean(pinExpiresAt && new Date(pinExpiresAt).getTime() > now), [pinExpiresAt, now]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const loadSettings = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Sign in is required to load shop settings.");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("shop_id").eq("id", user.id).maybeSingle<{ shop_id: string | null }>();
      if (profileError) throw profileError;
      if (!profile?.shop_id) throw new Error("No shop is associated with this profile.");
      setShopId(profile.shop_id);

      const { data: shop, error: shopError } = await supabase.from("shops").select("*").eq("id", profile.shop_id).maybeSingle<Record<string, unknown>>();
      if (shopError) throw shopError;
      if (shop) {
        setShopName(String(shop.shop_name ?? shop.name ?? shop.business_name ?? ""));
        setCountry(shop.country === "CA" ? "CA" : "US");
        setTimezone(String(shop.timezone ?? "America/New_York"));
        setPhone(String(shop.phone_number ?? ""));
        setEmail(String(shop.email ?? ""));
        setAddress(String(shop.street ?? shop.address ?? ""));
        setCity(String(shop.city ?? ""));
        setProvince(String(shop.province ?? ""));
        setPostalCode(String(shop.postal_code ?? ""));
        setLaborRate(typeof shop.labor_rate === "number" ? String(shop.labor_rate) : "");
        setDiagnosticFee(typeof shop.diagnostic_fee === "number" ? String(shop.diagnostic_fee) : "");
        setTaxRate(typeof shop.tax_rate === "number" ? String(shop.tax_rate) : "");
        setShopSuppliesEnabled(Boolean(shop.shop_supplies_enabled ?? (typeof shop.supplies_percent === "number" && shop.supplies_percent > 0)));
        setShopSuppliesType(shop.shop_supplies_type === "flat" ? "flat" : "percentage");
        setShopSuppliesPercent(typeof shop.shop_supplies_percent === "number" ? String(shop.shop_supplies_percent) : typeof shop.supplies_percent === "number" ? String(shop.supplies_percent) : "");
        setShopSuppliesFlatAmount(typeof shop.shop_supplies_flat_amount === "number" ? String(shop.shop_supplies_flat_amount) : "");
        setShopSuppliesCapAmount(typeof shop.shop_supplies_cap_amount === "number" ? String(shop.shop_supplies_cap_amount) : "");
        setUseAi(Boolean(shop.use_ai));
        setRequireCauseCorrection(Boolean(shop.require_cause_correction));
        setRequireAuthorization(Boolean(shop.require_authorization));
        setAutoGeneratePdf(Boolean(shop.auto_generate_pdf));
        setAutoSendQuoteEmail(Boolean(shop.auto_send_quote_email));
      }

      const hoursResponse = await fetch("/api/settings/hours", { cache: "no-store" });
      if (hoursResponse.ok) {
        const payload = (await hoursResponse.json()) as { hours?: OnboardingHourRow[] };
        if (Array.isArray(payload.hours) && payload.hours.length > 0) {
          const byDay = new Map(payload.hours.map((row) => [row.weekday, row]));
          setHours(DEFAULT_ONBOARDING_HOURS.map((fallback) => ({ ...fallback, ...(byDay.get(fallback.weekday) ?? {}) })));
        } else {
          setHours(DEFAULT_ONBOARDING_HOURS);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load shop settings.");
    } finally {
      setLoading(false);
    }
  }, [open, supabase]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);

  async function save() {
    if (!shopId) return;
    if (!isUnlocked) {
      toast.warning("Unlock with Owner PIN first.");
      setPinModalOpen(true);
      return;
    }
    setSaving(true);
    try {
      const updateResponse = await fetch("/api/settings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          update: {
            country,
            timezone,
            shop_name: shopName,
            name: shopName,
            street: address,
            address,
            city,
            province,
            postal_code: postalCode,
            phone_number: phone,
            email,
            labor_rate: asNumber(laborRate),
            supplies_percent: shopSuppliesType === "percentage" ? asNumber(shopSuppliesPercent) : null,
            shop_supplies_enabled: shopSuppliesEnabled,
            shop_supplies_type: shopSuppliesType,
            shop_supplies_percent: asNumber(shopSuppliesPercent),
            shop_supplies_flat_amount: asNumber(shopSuppliesFlatAmount),
            shop_supplies_cap_amount: asNumber(shopSuppliesCapAmount),
            diagnostic_fee: asNumber(diagnosticFee),
            tax_rate: asNumber(taxRate),
            use_ai: useAi,
            require_cause_correction: requireCauseCorrection,
            require_authorization: requireAuthorization,
            auto_generate_pdf: autoGeneratePdf,
            auto_send_quote_email: autoSendQuoteEmail,
          },
        }),
      });
      if (!updateResponse.ok) throw new Error(await readJsonError(updateResponse, "Failed to save shop settings."));

      const openDays = hours.filter((hour) => !hour.closed);
      const hoursResponse = await fetch("/api/settings/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, hours: openDays }),
      });
      if (!hoursResponse.ok) throw new Error(await readJsonError(hoursResponse, "Failed to save shop hours."));

      const detail = await completeStep(sessionId, "complete");
      onCompleted(detail);
      onClose();
      toast.success("Shop Settings saved and onboarding updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save Shop Settings.");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      const detail = await completeStep(sessionId, "skip");
      onCompleted(detail);
      onClose();
      toast.success("Shop Settings skipped for now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to skip Shop Settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const provinceLabel = country === "CA" ? "Province" : "State";
  const postalLabel = country === "CA" ? "Postal code" : "ZIP code";
  const currency = country === "CA" ? "CAD" : "USD";
  const inputClass = "border-white/10 bg-neutral-950/70 text-neutral-100 placeholder:text-neutral-500";

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm">
      <section className="mx-auto my-6 max-w-5xl rounded-[2rem] border border-white/10 bg-neutral-950 p-5 text-neutral-100 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-200/85">Guided onboarding · Shop Settings</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Confirm setup-critical shop defaults</h2>
            <p className="mt-2 max-w-3xl text-sm text-neutral-300">These focused settings keep quotes, invoices, approvals, and booking hours ready without leaving guided onboarding.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
            <Button type="button" variant="secondary" onClick={skip} disabled={saving}>Skip for now</Button>
            <Button type="button" onClick={save} disabled={saving || loading}>{saving ? "Saving..." : isUnlocked ? "Save Shop Settings" : "Unlock & save"}</Button>
          </div>
        </div>

        {loading ? <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-neutral-300">Loading current shop settings…</div> : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="Business">
            <div className="grid gap-3 md:grid-cols-2">
              <Input className={inputClass} value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop name" />
              <select value={country} onChange={(e) => setCountry(e.target.value as CountryCode)} className="h-10 rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-neutral-100"><option value="US">United States</option><option value="CA">Canada</option></select>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-10 rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-neutral-100">{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}</select>
              <Input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
              <Input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <Input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
              <Input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
              <Input className={inputClass} value={province} onChange={(e) => setProvince(e.target.value)} placeholder={provinceLabel} />
              <Input className={inputClass} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder={postalLabel} />
            </div>
          </Panel>

          <Panel title="Operations">
            <div className="grid gap-3 md:grid-cols-2">
              <Input className={inputClass} value={laborRate} onChange={(e) => setLaborRate(e.target.value)} placeholder={`Labor rate (${currency}/hr)`} />
              <Input className={inputClass} value={diagnosticFee} onChange={(e) => setDiagnosticFee(e.target.value)} placeholder={`Diagnostic fee (${currency})`} />
              <Input className={inputClass} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="Tax rate (%)" />
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm"><input type="checkbox" checked={shopSuppliesEnabled} onChange={(e) => setShopSuppliesEnabled(e.target.checked)} /> Shop supplies enabled</label>
              <select value={shopSuppliesType} onChange={(e) => setShopSuppliesType(e.target.value === "flat" ? "flat" : "percentage")} className="h-10 rounded-md border border-white/10 bg-neutral-950/70 px-3 text-sm text-neutral-100"><option value="percentage">Percentage</option><option value="flat">Flat amount</option></select>
              <Input className={inputClass} value={shopSuppliesPercent} onChange={(e) => setShopSuppliesPercent(e.target.value)} placeholder="Shop supplies (%)" />
              <Input className={inputClass} value={shopSuppliesFlatAmount} onChange={(e) => setShopSuppliesFlatAmount(e.target.value)} placeholder={`Shop supplies flat (${currency})`} />
              <Input className={inputClass} value={shopSuppliesCapAmount} onChange={(e) => setShopSuppliesCapAmount(e.target.value)} placeholder={`Supplies cap (${currency})`} />
            </div>
          </Panel>

          <Panel title="Hours">
            <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20">
              {hours.map((row, idx) => (
                <div key={row.weekday} className="grid gap-3 p-3 md:grid-cols-[70px_110px_1fr_1fr] md:items-center">
                  <div className="text-sm font-semibold">{WEEKDAYS[row.weekday]}</div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!row.closed} onChange={(e) => setHours((prev) => prev.map((h, i) => i === idx ? { ...h, closed: e.target.checked } : h))} /> Closed</label>
                  <input type="time" className="rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm" value={row.open_time} disabled={!!row.closed} onChange={(e) => setHours((prev) => prev.map((h, i) => i === idx ? { ...h, open_time: e.target.value } : h))} />
                  <input type="time" className="rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-sm" value={row.close_time} disabled={!!row.closed} onChange={(e) => setHours((prev) => prev.map((h, i) => i === idx ? { ...h, close_time: e.target.value } : h))} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Workflow">
            <div className="space-y-3 text-sm">
              {([
                ["Use AI features", useAi, setUseAi],
                ["Require cause / correction on lines", requireCauseCorrection, setRequireCauseCorrection],
                ["Require customer authorization", requireAuthorization, setRequireAuthorization],
                ["Auto-generate quote PDF", autoGeneratePdf, setAutoGeneratePdf],
                ["Auto-send quote email", autoSendQuoteEmail, setAutoSendQuoteEmail],
              ] as Array<[string, boolean, (next: boolean) => void]>).map(([label, value, setter]) => (
                <label key={String(label)} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  <input type="checkbox" checked={Boolean(value)} onChange={(e) => setter(e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </Panel>
        </div>
      </section>
      <OwnerPinModal shopId={shopId} open={pinModalOpen} onClose={() => setPinModalOpen(false)} onVerified={(iso) => setPinExpiresAt(iso)} />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>{children}</section>;
}
