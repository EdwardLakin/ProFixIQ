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

const widthMap: Record<NonNullable<ModalShellProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
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
  const width = widthMap[size];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[500] flex items-center justify-center px-3 py-6 sm:px-4"
    >
      <div
        className="fixed inset-0 bg-black/82 backdrop-blur-md"
        aria-hidden="true"
      />

      <div className={`relative z-[510] w-full ${width}`}>
        <Dialog.Panel className="relative w-full overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),rgba(10,10,10,0.97)_38%,rgba(5,5,5,0.99)_100%)] text-neutral-100 shadow-[0_28px_90px_rgba(0,0,0,0.96)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,rgba(184,115,51,0),rgba(184,115,51,0.95),rgba(253,186,116,0.95),rgba(184,115,51,0))]" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(184,115,51,0.14),transparent_72%)]" />

          <div className="relative flex items-center justify-between border-b border-white/10 bg-black/28 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              {title ? (
                <Dialog.Title
                  className="truncate text-[0.8rem] tracking-[0.22em] text-neutral-100"
                  style={{
                    fontFamily: "var(--font-blackops), system-ui, sans-serif",
                  }}
                >
                  {title}
                </Dialog.Title>
              ) : (
                <div />
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45 text-[0.78rem] text-neutral-200 transition hover:border-[var(--accent-copper-soft)] hover:bg-white/5 hover:text-white active:scale-95"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div
            className={`relative px-4 py-4 sm:px-5 sm:py-5 ${
              bodyScrollable ? "max-h-[calc(100vh-8rem)] overflow-y-auto" : ""
            }`}
          >
            {children}
          </div>

          {!hideFooter && (onSubmit || footerLeft) ? (
            <div className="relative flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 text-[0.72rem] text-neutral-400">
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
