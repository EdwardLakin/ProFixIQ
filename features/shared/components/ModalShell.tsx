//features/shared/components/ModalShell.tsx
"use client";

import { Dialog } from "@headlessui/react";
import { Button } from "@shared/components/ui/Button";

type ModalShellProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  onSubmit?: () => void | Promise<void>;
  submitText?: string;
  footerLeft?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  hideFooter?: boolean;
  bodyScrollable?: boolean;
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
  bodyScrollable = true,
}: ModalShellProps) {
  const width =
    size === "sm"
      ? "max-w-sm"
      : size === "md"
      ? "max-w-lg"
      : size === "lg"
      ? "max-w-4xl"
      : "max-w-6xl";

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[500] flex items-center justify-center px-3 py-6 sm:px-4"
    >
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md"
        aria-hidden="true"
      />

      <div className={`relative z-[510] w-full ${width}`}>
        <Dialog.Panel className="w-full overflow-hidden rounded-2xl border border-[var(--metal-border-soft)] bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)] text-neutral-100 shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
          <div className="flex items-center justify-between border-b border-[var(--metal-border-soft)] bg-black/40 px-4 py-3">
            {title ? (
              <Dialog.Title
                className="text-[0.8rem] tracking-[0.22em] text-neutral-200"
                style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
              >
                {title}
              </Dialog.Title>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-[0.75rem] text-neutral-200 transition hover:bg-black/80 hover:text-white active:scale-95"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div
            className={`px-4 py-4 sm:px-5 sm:py-5 ${
              bodyScrollable ? "max-h-[calc(100vh-8rem)] overflow-y-auto" : ""
            }`}
          >
            {children}
          </div>

          {!hideFooter && (onSubmit || footerLeft) ? (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--metal-border-soft)] bg-black/40 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 text-[0.7rem] text-neutral-400">
                {footerLeft}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>

                {onSubmit ? (
                  <Button
                    type="button"
                    variant="copper"
                    size="sm"
                    onClick={() => void onSubmit()}
                  >
                    {submitText}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
