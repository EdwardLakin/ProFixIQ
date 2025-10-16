// features/shared/components/modals/ModalShell.tsx
"use client";

import { Dialog } from "@headlessui/react";
import { ReactNode } from "react";

type Size = "sm" | "md" | "lg";

interface Props {
  isOpen: boolean;
  onClose: () => void | Promise<void>;
  onSubmit?: () => void | Promise<void>;
  title?: string | ReactNode;
  subtitle?: string | ReactNode;
  submitText?: string;
  size?: Size;
  footerLeft?: ReactNode;
  children?: ReactNode;
}

export default function ModalShell(props: any) {
  const {
    isOpen,
    onClose,
    onSubmit,
    title,
    subtitle,
    submitText,
    size = "md",
    footerLeft,
    children,
  } = props as Props;

  const maxW =
    size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      // keep this WELL above the FocusedJobModal (which is z-[100]/[110])
      className="fixed inset-0 z-[300] flex items-center justify-center"
    >
      {/* dark backdrop above everything behind it */}
      <div
        className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* centered panel (even higher than its own backdrop) */}
      <div className="relative z-[310] mx-4 my-6 w-full">
        <Dialog.Panel
          // force dark theme inside; no light fallback
          className={`profix-modal w-full ${maxW} rounded-lg border border-orange-400 bg-neutral-950 p-6 text-white shadow-xl`}
        >
          {(title || subtitle) && (
            <header className="mb-4">
              {title ? (
                <Dialog.Title className="font-header text-lg font-semibold tracking-wide">
                  {title}
                </Dialog.Title>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-sm text-neutral-400">{subtitle}</p>
              ) : null}
            </header>
          )}

          <div>{children}</div>

          <footer className="mt-6 flex items-center justify-between gap-2">
            <div>{footerLeft}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="font-header rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
              >
                Cancel
              </button>
              {onSubmit ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  className="font-header rounded border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10"
                >
                  {submitText ?? "Submit"}
                </button>
              ) : null}
            </div>
          </footer>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}