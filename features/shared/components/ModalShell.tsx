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

  const maxW = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-[120]">
      {/* darker scrim – always captures clicks */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel
          className={`pointer-events-auto w-full ${maxW} rounded border border-orange-400 bg-neutral-950 p-6 text-white shadow-xl`}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || subtitle) && (
            <header className="mb-4">
              {title ? (
                <Dialog.Title className="font-header text-lg font-semibold tracking-wide">
                  {title}
                </Dialog.Title>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 text-sm text-neutral-400">
                  {subtitle}
                </p>
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
                className="font-header rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              {onSubmit ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  className="font-header rounded border border-orange-500 px-4 py-2 text-sm hover:bg-orange-500/10"
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