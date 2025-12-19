"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import OwnerPinModal from "@shared/components/OwnerPinModal";
import OwnerPinBadge from "@shared/components/OwnerPinBadge";
import ShopPublicProfileSection from "@/features/shops/components/ShopPublicProfileSection";
import ReviewsList from "@shared/components/reviews/ReviewsList";

type FileInputChangeEvent = {
  target: {
    files: FileList | null;
  };
};

type HourRow = {
  weekday: number;
  open_time: string;
  close_time: string;
  closed?: boolean;
};
type TimeOffRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export default function OwnerSettingsPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);

  // PIN modal + timer
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinExpiresAt, setPinExpiresAt] = useState<string | undefined>();
  const [now, setNow] = useState<number>(() => Date.now());

  // NA defaults
  const [country, setCountry] = useState<"US" | "CA">("US");
  const [timezone, setTimezone] = useState<string>("America/New_York");

  // Shop fields
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Money / defaults
  const [laborRate, setLaborRate] = useState("");
  const [suppliesPercent, setSuppliesPercent] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [taxRate, setTaxRate] = useState("");

  // Workflow flags
  const [useAi, setUseAi] = useState(false);
  const [requireCauseCorrection, setRequireCauseCorrection] = useState(false);
  const [requireAuthorization, setRequireAuthorization] = useState(false);

  // Communication
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [emailOnComplete, setEmailOnComplete] = useState(false);

  // Automation
  const [autoGeneratePdf, setAutoGeneratePdf] = useState(false);
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState(false);

  // Hours + time off
  const [hours, setHours] = useState<HourRow[]>(
    Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      open_time: "08:00",
      close_time: "17:00",
      closed: i === 0 || i === 6,
    })),
  );
  const [timeOff, setTimeOff] = useState<TimeOffRow[]>([]);
  const [newOffStart, setNewOffStart] = useState("");
  const [newOffEnd, setNewOffEnd] = useState("");
  const [newOffReason, setNewOffReason] = useState("");

  // Shared UI classes for selects (fix: dark inputs + consistent font colors)
  const selectClass =
    "w-full rounded-md border border-border bg-neutral-950/60 px-3 py-2 text-sm text-neutral-100 shadow-inner outline-none transition focus:border-white/20 focus:ring-1 focus:ring-white/10 disabled:opacity-50";
  const labelClass = "text-xs text-neutral-400";

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isUnlocked = useMemo(() => {
    if (!pinExpiresAt) return false;
    return new Date(pinExpiresAt).getTime() > now;
  }, [pinExpiresAt, now]);

  const provinceLabel = country === "CA" ? "Province" : "State";
  const postalLabel = country === "CA" ? "Postal code" : "ZIP code";
  const taxLabel =
    country === "CA" ? "Tax rate (GST/PST/HST %)" : "Tax rate (Sales tax %)";
  const currency = country === "CA" ? "CAD" : "USD";

  // initial load
  useEffect(() => {
    const fetchSettings = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        toast.error(profErr.message);
        setLoading(false);
        return;
      }

      if (!profile?.shop_id) {
        setLoading(false);
        return;
      }

      const sid = profile.shop_id;
      setShopId(sid);

      // core shop row
      const { data: shop, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", sid)
        .maybeSingle();

      if (error) toast.error(error.message);

      if (shop) {
        // ✅ fix: prefer shop_name, fall back to name/business_name
        const resolvedShopName =
          (shop.shop_name as string | null) ||
          (shop.name as string | null) ||
          (shop.business_name as string | null) ||
          "";
        setShopName(resolvedShopName);

        // ✅ fix: prefer street, fall back to address
        const resolvedStreet =
          (shop.street as string | null) ||
          (shop.address as string | null) ||
          "";
        setAddress(resolvedStreet);

        setCity((shop.city as string | null) || "");
        setProvince((shop.province as string | null) || "");
        setPostalCode((shop.postal_code as string | null) || "");
        setPhone((shop.phone_number as string | null) || "");
        setEmail((shop.email as string | null) || "");
        setLogoUrl((shop.logo_url as string | null) || "");

        const c = (shop.country as string | null) || "US";
        setCountry(c === "CA" ? "CA" : "US");

        setTimezone((shop.timezone as string | null) || "America/New_York");

        setLaborRate(
          typeof shop.labor_rate === "number" ? String(shop.labor_rate) : "",
        );
        setSuppliesPercent(
          typeof shop.supplies_percent === "number"
            ? String(shop.supplies_percent)
            : "",
        );
        setDiagnosticFee(
          typeof shop.diagnostic_fee === "number"
            ? String(shop.diagnostic_fee)
            : "",
        );
        setTaxRate(typeof shop.tax_rate === "number" ? String(shop.tax_rate) : "");

        setUseAi(!!shop.use_ai);
        setRequireCauseCorrection(!!shop.require_cause_correction);
        setRequireAuthorization(!!shop.require_authorization);

        setInvoiceTerms((shop.invoice_terms as string | null) || "");
        setInvoiceFooter((shop.invoice_footer as string | null) || "");
        setEmailOnComplete(!!shop.email_on_complete);

        setAutoGeneratePdf(!!shop.auto_generate_pdf);
        setAutoSendQuoteEmail(!!shop.auto_send_quote_email);
      }

      // hours
      try {
        const res = await fetch(`/api/settings/hours?shopId=${sid}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j?.hours)) {
            const byDay = new Map<number, HourRow>();
            (j.hours as HourRow[]).forEach((h) =>
              byDay.set(h.weekday, { ...h, closed: false }),
            );
            const normalized = Array.from({ length: 7 }, (_, i) => {
              const existing = byDay.get(i);
              if (existing) return existing;
              return {
                weekday: i,
                open_time: "08:00",
                close_time: "17:00",
                closed: true,
              };
            });
            setHours(normalized);
          }
        }
      } catch {
        // ignore
      }

      // time off
      try {
        const res = await fetch(`/api/settings/time-off?shopId=${sid}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j?.items)) setTimeOff(j.items);
        }
      } catch {
        // ignore
      }

      setLoading(false);
    };

    void fetchSettings();
  }, [supabase]);

  const guardUnlock = () => {
    if (!isUnlocked) {
      toast.warning("Unlock with Owner PIN first.");
      setPinModalOpen(true);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    const payload = {
      shopId,
      update: {
        // ✅ NA fields
        country,
        timezone,

        // core
        shop_name: shopName,
        name: shopName, // keep name synced
        street: address,
        address, // keep both synced
        city,
        province,
        postal_code: postalCode,
        phone_number: phone,
        email,
        logo_url: logoUrl,

        // money
        labor_rate: laborRate ? parseFloat(laborRate) : null,
        supplies_percent: suppliesPercent ? parseFloat(suppliesPercent) : null,
        diagnostic_fee: diagnosticFee ? parseFloat(diagnosticFee) : null,
        tax_rate: taxRate ? parseFloat(taxRate) : null,

        // flags
        use_ai: useAi,
        require_cause_correction: requireCauseCorrection,
        require_authorization: requireAuthorization,

        invoice_terms: invoiceTerms,
        invoice_footer: invoiceFooter,
        email_on_complete: emailOnComplete,

        auto_generate_pdf: autoGeneratePdf,
        auto_send_quote_email: autoSendQuoteEmail,
      },
    };

    const res = await fetch("/api/settings/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Failed to save settings");
      return;
    }

    toast.success("Settings saved.");
  };

  const handleLogoUpload = async (e: FileInputChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filePath = `logos/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
    setLogoUrl(data.publicUrl);
    toast.success("Logo uploaded.");
  };

  const handleGenerateLogo = () => {
    toast.info("AI Logo generation coming soon…");
  };

  const saveHours = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    const openDays = hours.filter((h) => !h.closed);

    const res = await fetch("/api/settings/hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, hours: openDays }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Failed to save hours");
      return;
    }
    toast.success("Hours updated.");
  };

  const addTimeOff = async () => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    if (!newOffStart || !newOffEnd) {
      toast.warning("Select start and end time.");
      return;
    }

    const res = await fetch("/api/settings/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        range: {
          starts_at: newOffStart,
          ends_at: newOffEnd,
          reason: newOffReason || null,
        },
      }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error || "Failed to add time off");
      return;
    }

    setNewOffStart("");
    setNewOffEnd("");
    setNewOffReason("");

    try {
      const r = await fetch(`/api/settings/time-off?shopId=${shopId}`, {
        cache: "no-store",
      });
      if (r.ok) {
        const jj = await r.json();
        setTimeOff(jj.items || []);
      }
    } catch {
      // ignore
    }

    toast.success("Time off added.");
  };

  const deleteTimeOff = async (id: string) => {
    if (!shopId) return;
    if (!guardUnlock()) return;

    const res = await fetch("/api/settings/time-off", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, id }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error || "Failed to remove time off");
      return;
    }

    setTimeOff((prev) => prev.filter((t) => t.id !== id));
    toast.success("Removed.");
  };

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground">Loading shop settings…</div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <h1 className="text-2xl font-blackops text-orange-400">
            Shop Settings
          </h1>
          <p className="text-xs text-neutral-400">
            Location (US/CA), billing defaults, and scheduling.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OwnerPinBadge expiresAt={pinExpiresAt} />
          <Button size="sm" onClick={() => setPinModalOpen(true)}>
            {isUnlocked ? "Re-unlock" : "Unlock"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isUnlocked}>
            {isUnlocked ? "Save all" : "Unlock to save"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-neutral-50">Shop info</h2>

            {/* NA row */}
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <div className={labelClass}>Country</div>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value as "US" | "CA")}
                  className={selectClass}
                  disabled={!isUnlocked}
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className={labelClass}>Timezone</div>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className={selectClass}
                  disabled={!isUnlocked}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <Input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Shop name"
                disabled={!isUnlocked}
              />
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
                disabled={!isUnlocked}
              />

              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  disabled={!isUnlocked}
                />
                <Input
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder={provinceLabel}
                  disabled={!isUnlocked}
                />
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder={postalLabel}
                  disabled={!isUnlocked}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  disabled={!isUnlocked}
                />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  disabled={!isUnlocked}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="Logo URL"
                  disabled={!isUnlocked}
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={!isUnlocked}
                />
              </div>

              <Button
                onClick={handleGenerateLogo}
                variant="secondary"
                className="mt-1"
                disabled={!isUnlocked}
              >
                Generate logo with AI
              </Button>

              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="mt-2 h-20 w-32 rounded bg-white p-1 object-contain"
                />
              )}
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-neutral-50">
                Billing defaults
              </h2>
              <div className="grid gap-2 md:grid-cols-2 text-sm">
                <Input
                  value={laborRate}
                  onChange={(e) => setLaborRate(e.target.value)}
                  placeholder={`Labor rate (${currency}/hr)`}
                  disabled={!isUnlocked}
                />
                <Input
                  value={suppliesPercent}
                  onChange={(e) => setSuppliesPercent(e.target.value)}
                  placeholder="Shop supplies (%)"
                  disabled={!isUnlocked}
                />
                <Input
                  value={diagnosticFee}
                  onChange={(e) => setDiagnosticFee(e.target.value)}
                  placeholder={`Diagnostic fee (${currency})`}
                  disabled={!isUnlocked}
                />
                <Input
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder={taxLabel}
                  disabled={!isUnlocked}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-neutral-50">Workflow</h2>
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                  disabled={!isUnlocked}
                />
                Use AI features
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={requireCauseCorrection}
                  onChange={(e) => setRequireCauseCorrection(e.target.checked)}
                  disabled={!isUnlocked}
                />
                Require cause / correction on lines
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <input
                  type="checkbox"
                  checked={requireAuthorization}
                  onChange={(e) => setRequireAuthorization(e.target.checked)}
                  disabled={!isUnlocked}
                />
                Require customer authorization
              </label>
            </section>
          </div>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-neutral-50">
              Communication & branding
            </h2>
            <Input
              value={invoiceTerms}
              onChange={(e) => setInvoiceTerms(e.target.value)}
              placeholder="Invoice terms"
              disabled={!isUnlocked}
            />
            <Input
              value={invoiceFooter}
              onChange={(e) => setInvoiceFooter(e.target.value)}
              placeholder="Invoice footer note"
              disabled={!isUnlocked}
            />
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={emailOnComplete}
                onChange={(e) => setEmailOnComplete(e.target.checked)}
                disabled={!isUnlocked}
              />
              Email customer when job is complete
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-neutral-50">Automation</h2>
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={autoGeneratePdf}
                onChange={(e) => setAutoGeneratePdf(e.target.checked)}
                disabled={!isUnlocked}
              />
              Auto-generate quote PDF
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={autoSendQuoteEmail}
                onChange={(e) => setAutoSendQuoteEmail(e.target.checked)}
                disabled={!isUnlocked}
              />
              Auto-send quote email
            </label>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-neutral-50">
                Hours (controls public booking slots)
              </h2>
              <Button onClick={saveHours} disabled={!isUnlocked} size="sm">
                Save hours
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-7">
              {hours.map((row, idx) => {
                const closed = !!row.closed;
                return (
                  <div
                    key={row.weekday}
                    className="rounded border border-neutral-800 bg-neutral-900 p-2 text-xs"
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-orange-300">
                      <span>{WEEKDAYS[row.weekday]}</span>
                      <label className="flex items-center gap-1 text-[10px] text-neutral-300">
                        <input
                          type="checkbox"
                          checked={closed}
                          onChange={(e) => {
                            const isClosed = e.target.checked;
                            setHours((prev) => {
                              const copy = [...prev];
                              copy[idx] = { ...copy[idx], closed: isClosed };
                              return copy;
                            });
                          }}
                          disabled={!isUnlocked}
                        />
                        Closed
                      </label>
                    </div>
                    <label className="mb-1 block text-[10px] text-neutral-400">
                      Open
                    </label>
                    <input
                      type="time"
                      className="mb-2 w-full rounded bg-neutral-950 px-2 py-1 text-xs text-neutral-100 disabled:opacity-40"
                      value={row.open_time}
                      onChange={(e) => {
                        const v = e.target.value;
                        setHours((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], open_time: v };
                          return copy;
                        });
                      }}
                      disabled={!isUnlocked || closed}
                    />
                    <label className="mb-1 block text-[10px] text-neutral-400">
                      Close
                    </label>
                    <input
                      type="time"
                      className="w-full rounded bg-neutral-950 px-2 py-1 text-xs text-neutral-100 disabled:opacity-40"
                      value={row.close_time}
                      onChange={(e) => {
                        const v = e.target.value;
                        setHours((prev) => {
                          const copy = [...prev];
                          copy[idx] = { ...copy[idx], close_time: v };
                          return copy;
                        });
                      }}
                      disabled={!isUnlocked || closed}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-neutral-50">
              Time off / blackouts
            </h2>

            <div className="grid gap-2 md:grid-cols-4">
              <input
                type="datetime-local"
                className="rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
                value={newOffStart}
                onChange={(e) => setNewOffStart(e.target.value)}
                disabled={!isUnlocked}
              />
              <input
                type="datetime-local"
                className="rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
                value={newOffEnd}
                onChange={(e) => setNewOffEnd(e.target.value)}
                disabled={!isUnlocked}
              />
              <Input
                placeholder="Reason (optional)"
                value={newOffReason}
                onChange={(e) => setNewOffReason(e.target.value)}
                disabled={!isUnlocked}
              />
              <Button onClick={addTimeOff} disabled={!isUnlocked}>
                Add
              </Button>
            </div>

            {timeOff.length === 0 ? (
              <p className="text-xs text-neutral-500">No time-off entries.</p>
            ) : (
              <ul className="space-y-2">
                {timeOff.map((t) => {
                  const start = new Date(t.starts_at);
                  const end = new Date(t.ends_at);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="text-neutral-100">
                          {start.toLocaleString()} → {end.toLocaleString()}
                        </div>
                        {t.reason && (
                          <div className="text-xs text-neutral-400">
                            Reason: {t.reason}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void deleteTimeOff(t.id)}
                        disabled={!isUnlocked}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="w-full space-y-6 lg:w-80">
          {shopId && (
            <ShopPublicProfileSection shopId={shopId} isUnlocked={isUnlocked} />
          )}

          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-neutral-50">
              Invoice preview
            </h2>
            <div className="space-y-2 rounded bg-white p-3 text-xs text-black shadow">
              {logoUrl && (
                <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
              )}
              <div className="font-semibold">{shopName || "Your shop name"}</div>
              <div>
                {address}
                {address && ","} {city} {province} {postalCode}
              </div>
              <div>
                {phone} {phone && email && "•"} {email}
              </div>
              <hr className="my-2" />
              <div className="font-semibold text-black">Invoice terms</div>
              <p>{invoiceTerms || "—"}</p>
              <div className="font-semibold text-black">Footer</div>
              <p>{invoiceFooter || "—"}</p>
            </div>
          </section>

          {shopId && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-neutral-50">
                Customer reviews
              </h2>
              <p className="text-[11px] text-neutral-400">
                Recent reviews for your shop. Owners/admins/managers can reply
                directly.
              </p>
              <ReviewsList shopId={shopId} />
            </section>
          )}
        </div>
      </div>

      <OwnerPinModal
        shopId={shopId}
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onVerified={(iso: string | undefined) => setPinExpiresAt(iso)}
      />
    </div>
  );
}