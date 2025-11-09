"use client";

import { Dialog } from "@headlessui/react";
import React from "react";

type ModalShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  onSubmit?: () => void | Promise<void>;
  submitText?: string;
  footerLeft?: React.ReactNode;
  /**
   * sm = 24rem, md = 32rem, lg = 48rem
   */
  size?: "sm" | "md" | "lg";
};

export default function ModalShell({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  submitText = "Save",
  footerLeft,
  size = "md",
}: ModalShellProps) {
  const width =
    size === "sm"
      ? "max-w-sm"
      : size === "lg"
      ? "max-w-4xl"
      : "max-w-lg";

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* panel */}
      <div className={`relative z-[210] w-full ${width}`}>
        <Dialog.Panel className="w-full rounded-lg border border-neutral-700 bg-neutral-950 text-white shadow-xl">
          {/* header */}
          {(title || onClose) && (
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <Dialog.Title className="text-base font-semibold">
                {title}
              </Dialog.Title>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-transparent px-2 py-1 text-sm text-neutral-200 hover:border-neutral-600"
              >
                ✕
              </button>
            </div>
          )}

          {/* body */}
          <div className="px-4 py-4 space-y-3">{children}</div>

          {/* footer */}
          {(onSubmit || footerLeft) && (
            <div className="flex items-center justify-between gap-3 border-t border-neutral-800 px-4 py-3">
              <div>{footerLeft}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                >
                  Cancel
                </button>
                {onSubmit ? (
                  <button
                    type="button"
                    onClick={() => void onSubmit()}
                    className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-black hover:bg-orange-400"
                  >
                    {submitText}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}