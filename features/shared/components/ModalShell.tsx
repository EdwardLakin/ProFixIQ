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
        className="fixed inset-0 bg-[color:var(--theme-surface-inset)] backdrop-blur-md"
        aria-hidden="true"
      />

      <div className={`relative z-[510] w-full ${width}`}>
        <Dialog.Panel className="relative w-full overflow-hidden rounded-[26px] border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,rgba(184,115,51,0),rgba(184,115,51,0.95),rgba(253,186,116,0.95),rgba(184,115,51,0))]" />
          <div className="pointer-events-none absolute inset-x-10 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(184,115,51,0.14),transparent_72%)]" />

          <div className="relative flex items-center justify-between border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 sm:px-5">
            <div className="min-w-0">
              {title ? (
                <Dialog.Title
                  className="truncate text-[0.8rem] tracking-[0.22em] text-[color:var(--theme-text-primary)]"
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
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[0.78rem] text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-soft)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)] active:scale-95"
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
            <div className="relative flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2 text-[0.72rem] text-[color:var(--theme-text-secondary)]">
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
