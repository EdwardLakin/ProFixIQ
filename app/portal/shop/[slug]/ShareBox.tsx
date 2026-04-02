// app/portal/shop/[slug]/ShareBox.tsx
"use client";

import { useState } from "react";
import LinkButton from "@shared/components/ui/LinkButton";
import { toast } from "sonner";

export default function ShareBox({
  slug,
  bookingUrl,
  qrSrc,
}: {
  slug: string;
  bookingUrl: string;
  qrSrc: string;
}) {
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function copyLink() {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(bookingUrl);
      toast.success("Booking link copied!");
    } catch {
      toast.error("Couldn’t copy link");
    } finally {
      setCopying(false);
    }
  }

  async function downloadQR() {
    try {
      setDownloading(true);
      const res = await fetch(qrSrc, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch QR");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `profixiq-booking-${slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("QR code downloaded");
    } catch {
      toast.error("Couldn’t download QR");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-card backdrop-blur-xl sm:p-5">
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
          Booking link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={bookingUrl}
            className="flex-1 rounded-lg border border-white/10 bg-[var(--glass-bg)] px-3 py-2 text-sm text-white outline-none"
          />
          <button
            onClick={copyLink}
            disabled={copying}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-black/55 disabled:opacity-60"
          >
            {copying ? "Copying…" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[auto,1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt="Booking QR code"
          className="h-44 w-44 rounded-xl border border-white/10 bg-black/40 p-2"
        />

        <div className="space-y-3 text-sm text-neutral-300">
          <p>
            Print this QR and place it at your counter. Customers can scan it to
            open your booking page for{" "}
            <span className="font-mono text-[var(--accent-copper-light)]">@{slug}</span>.
          </p>

          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`/portal/booking?shop=${encodeURIComponent(slug)}`}
              className="rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Open booking page
            </LinkButton>

            <button
              onClick={downloadQR}
              disabled={downloading}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-black/55 disabled:opacity-60"
            >
              {downloading ? "Downloading…" : "Download QR"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
