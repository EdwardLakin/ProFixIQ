"use client";

import { useState } from "react";
import  LinkButton  from "@shared/components/ui/LinkButton";
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
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="space-y-3">
        <label className="block text-sm text-neutral-400">Booking link</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={bookingUrl}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          />
          <button
            onClick={copyLink}
            disabled={copying}
            className="rounded-lg border border-orange-600 px-3 py-2 text-sm text-orange-400 hover:bg-orange-600 hover:text-black transition"
          >
            {copying ? "Copying…" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-4 items-start">
        <img
          src={qrSrc}
          alt="Booking QR code"
          className="h-48 w-48 rounded-lg border border-neutral-800 bg-black p-2"
        />
        <div className="space-y-2">
          <p className="text-sm text-neutral-300">
            Print this QR and place it at your counter. Customers scan to open
            your booking page for <span className="text-orange-400">{slug}</span>.
          </p>
          <div className="flex gap-2">
            <LinkButton href={`/portal/booking?shop=${encodeURIComponent(slug)}`} variant="outline">
              Open booking page
            </LinkButton>
            <button
              onClick={downloadQR}
              disabled={downloading}
              className="rounded-lg border border-orange-600 px-3 py-2 text-sm text-orange-400 hover:bg-orange-600 hover:text-black transition"
            >
              {downloading ? "Downloading…" : "Download QR"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}