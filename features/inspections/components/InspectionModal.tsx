"use client";

import { useEffect, useMemo } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  open: boolean;   // ✅ renamed: remove function props entirely
  src: string | null;
  title?: string;
};

export default function InspectionModal({ open, src, title = "Inspection" }: Props) {
  // Compute iframe src safely with embed flags
  const iframeSrc = useMemo(() => {
    if (!src) return null;
    try {
      const base =
        typeof window !== "undefined" ? window.location.origin : "";
      const u = new URL(src, base);
      u.searchParams.set("embed", "1");
      u.searchParams.set("compact", "1");
      return u.toString();
    } catch {
      return src;
    }
  }, [src]);

  // ✅ Listen for messages from inside iframe to close modal
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "inspection:close") {
        window.dispatchEvent(new CustomEvent("inspection:close"));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <ModalShell
  isOpen={open}
  onClose={() => window.dispatchEvent(new CustomEvent("inspection:close"))}
  size="lg"
  title={title}
  footerLeft={null}
  submitText={undefined}
  onSubmit={undefined}
>
  {!iframeSrc ? (
    <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-neutral-400 text-center">
      No inspection selected.
    </div>
  ) : (
    <div className="flex items-center justify-center">
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        className="h-[75vh] w-full max-w-5xl rounded border border-neutral-800"
      />
    </div>
  )}
</ModalShell>
  )}