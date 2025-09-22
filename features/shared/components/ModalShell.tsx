"use client";

import { Dialog } from "@headlessui/react";
import { ReactNode } from "react";

type Size = "sm" | "md" | "lg";

interface Props {
  isOpen: boolean;
  onClose: () => void | Promise<void>;
  onSubmit?: () => void | Promise<void>;
  title?: ReactNode;      // allow styled titles (e.g., status-colored)
  subtitle?: ReactNode;   // allow styled subtitles
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
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
      {/* darker overlay, match other dark modals */}
      <div className="fixed inset-0 bg-black/60" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel
          className={`w-full ${maxW} rounded-lg border border-neutral-800 bg-neutral-950 text-white shadow-2xl`}
        >
          {(title || subtitle) && (
            <header className="mb-4 border-b border-neutral-900 px-6 pt-5 pb-3">
              {title ? (
                <Dialog.Title className="font-header text-lg tracking-wide">
                  {title}
                </Dialog.Title>
              ) : null}
              {subtitle ? (
                <div className="mt-1 text-sm text-neutral-400">{subtitle}</div>
              ) : null}
            </header>
          )}

          <div className="px-6">{children}</div>

          <footer className="mt-6 flex items-center justify-between gap-2 border-t border-neutral-900 px-6 py-4">
            <div>{footerLeft}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="font-header rounded border border-neutral-700 bg-transparent px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
              >
                Cancel
              </button>
              {onSubmit ? (
                <button
                  onClick={onSubmit}
                  className="font-header rounded border border-orange-600 bg-transparent px-4 py-2 text-sm text-orange-300 hover:bg-orange-900/20"
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