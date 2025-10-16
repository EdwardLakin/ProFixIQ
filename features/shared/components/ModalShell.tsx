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
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      {/* Backdrop above FocusedJobModal (which uses z-[100]/[110]) */}
      <div
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Centered modal panel */}
      <div className="relative z-[210] mx-4 my-6 w-full">
        <Dialog.Panel
          className={`profix-modal w-full ${maxW} rounded-lg border border-orange-400 bg-white p-6 text-black shadow-xl dark:bg-neutral-950 dark:text-white`}
        >
          {/* Header */}
          {(title || subtitle) && (
            <header className="mb-4">
              {title ? (
                <Dialog.Title className="font-header text-lg font-semibold tracking-wide">
                  {title}
                </Dialog.Title>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                  {subtitle}
                </p>
              ) : null}
            </header>
          )}

          {/* Body */}
          <div>{children}</div>

          {/* Footer */}
          <footer className="mt-6 flex items-center justify-between gap-2">
            <div>{footerLeft}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="font-header rounded border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              {onSubmit ? (
                <button
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