"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Copy, Loader2, Printer, QrCode, RefreshCw, Save, ScanLine } from "lucide-react";
import { toast } from "sonner";

type Campaign = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  allow_booking: boolean;
  scan_count: number;
  verified_count: number;
};

export default function CustomerPortalQrBuilder() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [shopName, setShopName] = useState("Your shop");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("Front desk");
  const [allowBooking, setAllowBooking] = useState(true);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/portal/qr/campaign", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { campaign?: Campaign; shopName?: string }
        | null;
      if (response.ok && payload?.campaign) {
        setCampaign(payload.campaign);
        setName(payload.campaign.name);
        setAllowBooking(payload.campaign.allow_booking);
        setShopName(payload.shopName || "Your shop");
      } else toast.error("Customer portal campaign could not be loaded.");
      setLoading(false);
    })();
  }, []);

  const baseUrl = typeof window === "undefined" ? "https://profixiq.com" : window.location.origin;
  const enrollmentUrl = campaign ? `${baseUrl}/portal/join/${campaign.slug}` : "";
  const qrSrc = campaign ? `/api/portal/qr/${encodeURIComponent(campaign.slug)}` : "";
  const conversion = useMemo(() => {
    if (!campaign?.scan_count) return 0;
    return Math.round((campaign.verified_count / campaign.scan_count) * 100);
  }, [campaign]);

  async function update(options: { rotate?: boolean } = {}) {
    if (!campaign || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/portal/qr/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, name, allowBooking, rotate: options.rotate }),
      });
      const payload = (await response.json().catch(() => null)) as { campaign?: Campaign; error?: string } | null;
      if (!response.ok || !payload?.campaign) throw new Error(payload?.error || "Campaign could not be saved.");
      setCampaign(payload.campaign);
      toast.success(options.rotate ? "QR code rotated. Reprint existing cards." : "Campaign saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center text-[color:var(--theme-text-secondary)]"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-[color:var(--theme-text-primary)] xl:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">Customer portal</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">QR & print campaign</h1>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">Create, rotate, preview, and print secure customer enrollment materials.</p>
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2.5 text-sm font-bold text-[color:var(--theme-text-on-accent)] print:hidden"><Printer className="h-4 w-4" /> Print / Save PDF</button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(340px,1.15fr)_minmax(260px,0.8fr)]">
        <section className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)] print:hidden">
          <div className="flex items-center gap-2 font-semibold"><QrCode className="h-4 w-4 text-[var(--accent-copper)]" /> Campaign setup</div>
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">Campaign name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]" /></label>
          <div>
            <div className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Enrollment URL</div>
            <button onClick={() => { void navigator.clipboard.writeText(enrollmentUrl); toast.success("Enrollment link copied."); }} className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-left text-xs"><span className="truncate">{enrollmentUrl}</span><Copy className="h-4 w-4 shrink-0" /></button>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-3 text-sm"><span>Allow service booking</span><input type="checkbox" checked={allowBooking} onChange={(event) => setAllowBooking(event.target.checked)} className="h-4 w-4 accent-[var(--accent-copper)]" /></label>
          <button disabled={saving} onClick={() => void update()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 py-2.5 text-sm font-bold text-[color:var(--theme-text-on-accent)] disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save campaign</button>
          <button disabled={saving} onClick={() => { if (window.confirm("Rotate this code? Previously printed QR cards will stop working.")) void update({ rotate: true }); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-semibold text-[color:var(--theme-text-secondary)]"><RefreshCw className="h-4 w-4" /> Rotate code</button>
        </section>

        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)] print:border-0 print:bg-white print:p-0 print:shadow-none">
          <div className="mx-auto max-w-sm overflow-hidden rounded-[1.6rem] border border-[color:var(--theme-border-strong)] bg-white text-slate-950 shadow-xl print:max-w-none print:rounded-none print:border-0 print:shadow-none">
            <div className="p-8 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#a94f28]">{shopName}</div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em]">Your service history.<br /><span className="text-[#b9582c]">One scan away.</span></h2>
              {qrSrc ? <Image src={qrSrc} alt="Customer portal enrollment QR code" width={224} height={224} unoptimized className="mx-auto mt-6 h-56 w-56 rounded-xl border border-slate-200 p-2" /> : null}
              <div className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4 text-[#b9582c]" /> Scan to create your secure customer portal</div>
            </div>
            <div className="bg-slate-950 px-6 py-4 text-center text-xs font-semibold tracking-[0.18em] text-white">POWERED BY <span className="text-[#dd7543]">PROFIXIQ</span></div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)] print:hidden">
          <div className="font-semibold">Campaign activity</div>
          <div className="grid grid-cols-3 gap-2">
            {[['Scans', campaign?.scan_count ?? 0], ['Verified', campaign?.verified_count ?? 0], ['Conversion', `${conversion}%`]].map(([label, value]) => <div key={label} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-center"><div className="text-xl font-semibold">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">{label}</div></div>)}
          </div>
          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-xs leading-5 text-[color:var(--theme-text-secondary)]">Best results: print the counter card on matte card stock and place it near reception. Rotate the code if a printed card is lost or used outside the shop.</div>
        </section>
      </div>
    </div>
  );
}
