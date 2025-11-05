"use client";

import { Dialog } from "@headlessui/react";

type InspectionModalProps = {
  open: boolean;
  onClose: () => void;
  src: string | null;
  title?: string;
};

export default function InspectionModal({
  open,
  onClose,
  src,
  title = "Inspection",
}: InspectionModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="fixed inset-0 z-[999] flex items-center justify-center"
    >
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* panel */}
      <div className="relative z-[1000] mx-2 my-4 flex h-[90vh] w-full max-w-6xl flex-col rounded-xl border border-orange-400 bg-black/90 shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-white/20 px-2 py-1 text-xs text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>

        {/* body (iframe) */}
        <div className="flex-1 overflow-hidden bg-black/50">
          {src ? (
            <iframe
              key={src}
              src={src}
              className="h-full w-full border-0"
              // let the embedded page know it’s inside a modal
              allow="camera; microphone; clipboard-write; autoplay"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              No inspection selected.
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}