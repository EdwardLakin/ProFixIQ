// features/inspections/components/GlobalInspectionPortal.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import InspectionModal from "@/features/inspections/components/InspectionModal";

type OpenPayload = {
  src: string;
  title?: string;
};

export default function GlobalInspectionPortal() {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("Inspection");

  const handleClose = useCallback(() => {
    setOpen(false);
    setSrc(null);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenPayload>).detail;
      if (!detail?.src) return;
      setSrc(detail.src);
      setTitle(detail.title ?? "Inspection");
      setOpen(true);
    };

    const onClose = () => {
      setOpen(false);
      setSrc(null);
    };

    window.addEventListener("inspection:open", onOpen);
    window.addEventListener("inspection:close", onClose);

    return () => {
      window.removeEventListener("inspection:open", onOpen);
      window.removeEventListener("inspection:close", onClose);
    };
  }, []);

  return (
    <InspectionModal
      open={open}
      src={src}
      title={title}
      onClose={handleClose}
    />
  );
}