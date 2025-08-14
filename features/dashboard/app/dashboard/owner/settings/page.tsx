"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";
import OwnerPinModal from "@shared/components/OwnerPinModal";
import OwnerPinBadge from "@shared/components/OwnerPinBadge";

type HourRow = { weekday: number; open_time: string; close_time: string };
type TimeOffRow = { id: string; starts_at: string; ends_at: string; reason: string | null };

  const supabase = createClientComponentClient<Database>();


const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function OwnerSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<string | null>(null);

  // PIN modal + timer
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinExpiresAt, setPinExpiresAt] = useState<string | undefined>(undefined);
  const [now, setNow] = useState<number>(() => Date.now()); // heartbeat for expiry re-check

  // Shop fields
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  const [laborRate, setLaborRate] = useState("");
  const [suppliesPercent, setSuppliesPercent] = useState("");
  const [diagnosticFee, setDiagnosticFee] = useState("");
  const [taxRate, setTaxRate] = useState("");

  const [useAi, setUseAi] = useState(false);
  const [requireCauseCorrection, setRequireCauseCorrection] = useState(false);
  const [requireAuthorization, setRequireAuthorization] = useState(false);

  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [emailOnComplete, setEmailOnComplete] = useState(false);

  const [autoGeneratePdf, setAutoGeneratePdf] = useState(false);
  const [autoSendQuoteEmail, setAutoSendQuoteEmail] = useState(false);

  // Hours + Time off
  const [hours, setHours] = useState<HourRow[]>(
    Array.from({ length: 7 }, (_, i) => ({ weekday: i, open_time: "08:00", close_time: "17:00" })),
  );
  const [timeOff, setTimeOff] = useState<TimeOffRow[]>([]);
  const [newOffStart, setNewOffStart] = useState("");
  const [newOffEnd, setNewOffEnd] = useState("");
  const [newOffReason, setNewOffReason] = useState("");

  // Heartbeat so the unlock state re-evaluates as time passes
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isUnlocked = useMemo(() => {
    if (!pinExpiresAt) return false;
    return new Date(pinExpiresAt).getTime() > now;
  }, [pinExpiresAt, now]);

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
        .single();

      if (profErr) {
        toast.error(profErr.message);
        setLoading(false);
        return;
      }

      if (!profile?.shop_id) {
        setLoading(false);
        return;
      }

      setShopId(profile.shop_id);

      // Load shop core settings
      const { data: shop, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", profile.shop_id)
        .single();

      if (error) {
        toast.error(error.message);
      }

      if (shop) {
        setShopName(shop.name || "");
        setAddress(shop.address || "");
        setCity(shop.city || "");
        setProvince(shop.province || "");
        setPostalCode(shop.postal_code || "");
        setPhone(shop.phone_number || "");
        setEmail(shop.email || "");
        setLogoUrl(shop.logo_url || "");

        setLaborRate(shop.labor_rate?.toString() || "");
        setSuppliesPercent(shop.supplies_percent?.toString() || "");
        setDiagnosticFee(shop.diagnostic_fee?.toString() || "");
        setTaxRate(shop.tax_rate?.toString() || "");

        setUseAi(!!shop.use_ai);
        setRequireCauseCorrection(!!shop.require_cause_correction);
        setRequireAuthorization(!!shop.require_authorization);

        setInvoiceTerms(shop.invoice_terms || "");
        setInvoiceFooter(shop.invoice_footer || "");
        setEmailOnComplete(!!shop.email_on_complete);

        setAutoGeneratePdf(!!shop.auto_generate_pdf);
        setAutoSendQuoteEmail(!!shop.auto_send_quote_email);
      }

      // Load hours
      try {
        const res = await fetch(`/api/settings/hours?shopId=${profile.shop_id}`, { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j?.hours) && j.hours.length) {
            // ensure all 7 days appear in order; fallback defaults for missing ones
            const byDay = new Map<number, HourRow>();
            j.hours.forEach((h: HourRow) => byDay.set(h.weekday, h));
            const normalized = Array.from({ length: 7 }, (_, i) =>
              byDay.get(i) || { weekday: i, open_time: "08:00", close_time: "17:00" },
            );
            setHours(normalized);
          }
        }
      } catch (e) {
        // non-fatal
      }

      // Load time-off
      try {
        const res = await fetch(`/api/settings/time-off?shopId=${profile.shop_id}`, { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (Array.isArray(j?.items)) setTimeOff(j.items);
        }
      } catch (e) {
        // non-fatal
      }

      setLoading(false);
    };

    fetchSettings();
  }, []);

  // Save shop settings via secure API (server enforces PIN cookie + role + shop scope)
  const handleSave = async () => {
    if (!shopId) return;
    if (!isUnlocked) {
      toast.warning("Unlock settings with your Owner PIN first.");
      setPinModalOpen(true);
      return;
    }

    const payload = {
      shopId,
      update: {
        name: shopName,
        address,
        city,
        province,
        postal_code: postalCode,
        phone_number: phone,
        email,
        logo_url: logoUrl,

        labor_rate: laborRate ? parseFloat(laborRate) : null,
        supplies_percent: suppliesPercent ? parseFloat(suppliesPercent) : null,
        diagnostic_fee: diagnosticFee ? parseFloat(diagnosticFee) : null,
        tax_rate: taxRate ? parseFloat(taxRate) : null,

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filePath = `logos/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("logos")
      .upload(filePath, file, { upsert: true });

    if (error) {
      toast.error(error.message);
    } else {
      const { data } = supabase.storage.from("logos").getPublicUrl(filePath);
      setLogoUrl(data.publicUrl);
      toast.success("Logo uploaded!");
    }
  };

  const handleGenerateLogo = () => {
    toast.info("AI Logo generation coming soon...");
  };

  // Save weekly hours
  const saveHours = async () => {
    if (!shopId) return;
    if (!isUnlocked) {
      toast.warning("Unlock settings with your Owner PIN first.");
      setPinModalOpen(true);
      return;
    }
    const payload = { shopId, hours };
    const res = await fetch("/api/settings/hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j?.error || "Failed to save hours");
      return;
    }
    toast.success("Hours updated.");
  };

  // Add time off
  const addTimeOff = async () => {
    if (!shopId) return;
    if (!isUnlocked) {
      toast.warning("Unlock settings with your Owner PIN first.");
      setPinModalOpen(true);
      return;
    }
    if (!newOffStart || !newOffEnd) {
      toast.warning("Select a start and end time.");
      return;
    }
    const res = await fetch("/api/settings/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        range: { starts_at: newOffStart, ends_at: newOffEnd, reason: newOffReason || null },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j?.error || "Failed to add time off");
      return;
    }
    // refresh list
    setNewOffStart("");
    setNewOffEnd("");
    setNewOffReason("");
    try {
      const r = await fetch(`/api/settings/time-off?shopId=${shopId}`, { cache: "no-store" });
      if (r.ok) {
        const jj = await r.json();
        setTimeOff(jj.items || []);
      }
    } catch {}
    toast.success("Time off added.");
  };

  const deleteTimeOff = async (id: string) => {
    if (!shopId) return;
    if (!isUnlocked) {
      toast.warning("Unlock settings with your Owner PIN first.");
      setPinModalOpen(true);
      return;
    }
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

  if (loading) return <div className="p-4">Loading shop settings...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-10 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-orange-400">Shop Settings</h1>

        {/* Unlock controls */}
        <div className="flex items-center gap-2">
          <OwnerPinBadge expiresAt={pinExpiresAt} />
          <Button onClick={() => setPinModalOpen(true)}>
            {isUnlocked ? "Re-unlock" : "Unlock"}
          </Button>
        </div>
      </div>

      {/* Shop Info */}
      <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xl font-semibold">Shop Info</h2>
        <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop Name" />
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          <Input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Province/State" />
          <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal Code" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo URL" />
          <Input type="file" accept="image/*" onChange={handleLogoUpload} />
        </div>
        <Button onClick={handleGenerateLogo} variant="secondary">
          Generate Logo with AI
        </Button>
        {logoUrl && (
          <img src={logoUrl} alt="Logo" className="w-32 h-32 object-contain border mt-2 bg-white p-1" />
        )}
      </section>

      {/* Billing Defaults */}
      <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xl font-semibold">Billing Defaults</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input value={laborRate} onChange={(e) => setLaborRate(e.target.value)} placeholder="Labor Rate ($/hr)" />
          <Input value={suppliesPercent} onChange={(e) => setSuppliesPercent(e.target.value)} placeholder="Shop Supplies (%)" />
          <Input value={diagnosticFee} onChange={(e) => setDiagnosticFee(e.target.value)} placeholder="Diagnostic Fee ($)" />
          <Input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="Tax Rate (%)" />
        </div>
      </section>

      {/* Workflow Settings */}
      <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xl font-semibold">Workflow Settings</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          Use AI features
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requireCauseCorrection}
            onChange={(e) => setRequireCauseCorrection(e.target.checked)}
          />
          Require cause/correction
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requireAuthorization}
            onChange={(e) => setRequireAuthorization(e.target.checked)}
          />
          Require customer authorization
        </label>
      </section>

      {/* Communication & Branding */}
      <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xl font-semibold">Communication & Branding</h2>
        <Input value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} placeholder="Invoice Terms" />
        <Input value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} placeholder="Invoice Footer Note" />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={emailOnComplete}
            onChange={(e) => setEmailOnComplete(e.target.checked)}
          />
          Email customer when job is complete
        </label>
      </section>

      {/* Live Invoice Preview */}
      <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xl font-semibold text-white">Live Invoice Preview</h2>
        <div className="bg-white text-black p-4 rounded shadow space-y-2">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-16" />}
          <div className="text-sm text-gray-700">{shopName}</div>
          <div className="text-xs">
            {address}, {city}, {province}, {postalCode}
          </div>
          <div className="text-xs">
            {phone} • {email}
          </div>
          <hr />
          <div className="text-sm font-bold">Invoice Terms:</div>
          <p className="text-xs">{invoiceTerms}</p>
          <div className="text-sm font-bold">Footer:</div>
          <p className="text-xs">{invoiceFooter}</p>
        </div>
      </section>

      {/* Hours */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Hours</h2>
          <Button onClick={saveHours} disabled={!isUnlocked}>
            Save Hours
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-sm text-neutral-300">
          {hours.map((row, idx) => (
            <div key={row.weekday} className="rounded border border-neutral-800 p-2">
              <div className="font-semibold text-orange-400 mb-2 text-center">
                {WEEKDAYS[row.weekday]}
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-neutral-400">Open</label>
                <input
                  type="time"
                  className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1"
                  value={row.open_time}
                  onChange={(e) => {
                    const v = e.target.value;
                    setHours((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], open_time: v };
                      return copy;
                    });
                  }}
                  disabled={!isUnlocked}
                />
                <label className="block text-xs text-neutral-400">Close</label>
                <input
                  type="time"
                  className="w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1"
                  value={row.close_time}
                  onChange={(e) => {
                    const v = e.target.value;
                    setHours((prev) => {
                      const copy = [...prev];
                      copy[idx] = { ...copy[idx], close_time: v };
                      return copy;
                    });
                  }}
                  disabled={!isUnlocked}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Time Off */}
      <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Time Off / Blackouts</h2>
        </div>

        {/* Add new */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            type="datetime-local"
            className="rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
            value={newOffStart}
            onChange={(e) => setNewOffStart(e.target.value)}
            disabled={!isUnlocked}
          />
          <input
            type="datetime-local"
            className="rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
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

        {/* List */}
        {timeOff.length === 0 ? (
          <p className="text-sm text-neutral-400">No time-off entries.</p>
        ) : (
          <ul className="space-y-2">
            {timeOff.map((t) => {
              const start = new Date(t.starts_at);
              const end = new Date(t.ends_at);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2"
                >
                  <div className="text-sm">
                    <div className="text-white">
                      {start.toLocaleString()} → {end.toLocaleString()}
                    </div>
                    {t.reason && (
                      <div className="text-xs text-neutral-400">Reason: {t.reason}</div>
                    )}
                  </div>
                  <Button variant="secondary" onClick={() => deleteTimeOff(t.id)} disabled={!isUnlocked}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Automation */}
      <section className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-xl font-semibold">Automation</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoGeneratePdf}
            onChange={(e) => setAutoGeneratePdf(e.target.checked)}
          />
          Auto-generate quote PDF
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoSendQuoteEmail}
            onChange={(e) => setAutoSendQuoteEmail(e.target.checked)}
          />
          Auto-send quote email
        </label>
      </section>

      <div className="flex items-center justify-end">
        <Button onClick={handleSave} className="mt-2" disabled={!isUnlocked}>
          {isUnlocked ? "Save Settings" : "Unlock to Save"}
        </Button>
      </div>

      {/* PIN Modal */}
      {shopId && (
        <OwnerPinModal
          shopId={shopId}
          open={pinModalOpen}
          onClose={() => setPinModalOpen(false)}
          onVerified={(iso) => setPinExpiresAt(iso)}
        />
      )}
    </div>
  );
}