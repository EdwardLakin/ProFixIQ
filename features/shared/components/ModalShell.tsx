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
  /** sm = 24rem, md = 32rem, lg = 48rem, xl = 64rem */
  size?: "sm" | "md" | "lg" | "xl";
  /** hide the footer completely (for interactive panels like AI) */
  hideFooter?: boolean;
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
  hideFooter = false,
}: ModalShellProps) {
  const width =
    size === "sm"
      ? "max-w-sm"
      : size === "md"
      ? "max-w-lg"
      : size === "lg"
      ? "max-w-4xl"
      : "max-w-6xl"; // xl

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6"
    >
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* panel wrapper */}
      <div className={`relative z-[510] w-full ${width}`}>
        <Dialog.Panel className="w-full overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-xl">
          {/* header — orange bar */}
          <div className="flex items-center justify-between border-b border-border/60 bg-orange-500 px-4 py-3 text-black">
            {title ? (
              <Dialog.Title className="text-base font-semibold">
                {title}
              </Dialog.Title>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-sm hover:bg-black/10"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* body */}
          <div className="px-4 py-4">{children}</div>

          {/* footer */}
          {!hideFooter && (onSubmit || footerLeft) && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
              <div>{footerLeft}</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-border/60 bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-muted/70"
                >
                  Cancel
                </button>
                {onSubmit && (
                  <button
                    type="button"
                    onClick={() => void onSubmit()}
                    className="rounded bg-orange-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-orange-400 disabled:opacity-60"
                  >
                    {submitText}
                  </button>
                )}
              </div>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}