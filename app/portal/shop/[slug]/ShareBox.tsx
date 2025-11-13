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
    <div className="space-y-6 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:p-5">
      {/* Booking link */}
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-neutral-400">
          Booking link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={bookingUrl}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={copyLink}
            disabled={copying}
            className="rounded-lg border border-orange-600 px-3 py-2 text-sm font-semibold text-orange-400 transition hover:bg-orange-600 hover:text-black disabled:opacity-60"
          >
            {copying ? "Copying…" : "Copy link"}
          </button>
        </div>
      </div>

      {/* QR + actions */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[auto,1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt="Booking QR code"
          className="h-44 w-44 rounded-lg border border-neutral-800 bg-black p-2"
        />

        <div className="space-y-3 text-sm text-neutral-300">
          <p>
            Print this QR and place it at your counter. Customers can scan it to
            open your booking page for{" "}
            <span className="font-mono text-orange-400">@{slug}</span>.
          </p>

          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={`/portal/booking?shop=${encodeURIComponent(slug)}`}
              className="rounded-lg border border-orange-600 bg-orange-600 px-3 py-2 text-sm font-semibold text-black transition hover:bg-orange-500"
            >
              Open booking page
            </LinkButton>

            <button
              onClick={downloadQR}
              disabled={downloading}
              className="rounded-lg border border-orange-600 px-3 py-2 text-sm font-semibold text-orange-400 transition hover:bg-orange-600 hover:text-black disabled:opacity-60"
            >
              {downloading ? "Downloading…" : "Download QR"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}