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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800"
      />
      <p className="mt-2 text-xs text-neutral-500">
        Tip: on mobile, this opens the camera.
      </p>
    </ModalShell>
  );
}