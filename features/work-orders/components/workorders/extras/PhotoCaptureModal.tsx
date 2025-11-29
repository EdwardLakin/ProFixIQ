"use client";

import { useRef, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
}

export default function PhotoCaptureModal(props: any) {
  const { isOpen, onClose, onCapture } = props as Props;
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    if (!file) return onClose();
    await onCapture(file);
    onClose();
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Attach Photo"
      submitText="Upload"
      size="sm"
    >
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
          Job photo
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-neutral-100 hover:file:bg-neutral-700 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          On mobile, this will open the camera. On desktop, you can pick an
          existing image file.
        </p>
      </div>
    </ModalShell>
  );
}