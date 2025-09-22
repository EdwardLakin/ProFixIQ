"use client";

import { Dialog } from "@headlessui/react";
import { ReactNode } from "react";

type Size = "sm" | "md" | "lg";

interface Props {
  isOpen: boolean;
  onClose: () => void | Promise<void>;
  onSubmit?: () => void | Promise<void>;
  title?: string;
  /** extra: allow callers to color the title (status-based) */
  titleClass?: string;
  subtitle?: string;
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
    titleClass,
    subtitle,
    submitText,
    size = "md",
    footerLeft,
    children,
  } = props as Props;

  const maxW = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel
          className={`w-full ${maxW} rounded bg-neutral-900 text-white border border-orange-400 shadow-2xl`}
        >
          {(title || subtitle) && (
            <header className="mb-3 border-b border-neutral-800 px-6 pt-5 pb-3">
              {title ? (
                <Dialog.Title
                  className={`font-blackops text-lg tracking-wide ${titleClass ?? ""}`}
                >
                  {title}
                </Dialog.Title>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-xs text-neutral-400 font-roboto">{subtitle}</p>
              ) : null}
            </header>
          )}

          <div className="px-6 pb-4 font-roboto">{children}</div>

          <footer className="mt-1 flex items-center justify-between gap-2 px-6 pb-5">
            <div>{footerLeft}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="font-blackops rounded border border-neutral-600 px-4 py-2 text-sm hover:border-orange-400"
              >
                Cancel
              </button>
              {onSubmit ? (
                <button
                  onClick={onSubmit}
                  className="font-blackops rounded border border-orange-500 px-4 py-2 text-sm hover:border-orange-400"
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