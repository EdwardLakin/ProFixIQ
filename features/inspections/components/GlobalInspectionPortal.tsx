"use client";

import { useEffect, useState, useCallback } from "react";
import InspectionModal from "./InspectionModal";

type OpenEventDetail = {
  src: string;
  title?: string;
};

export default function GlobalInspectionPortal() {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("Inspection");

  const handleClose = useCallback(() => {
    setOpen(false);
    // keep src so if they reopen fast, we have a value — or clear if you prefer
    // setSrc(null);
  }, []);

  useEffect(() => {
    const handleOpen = (evt: Event) => {
      const detail = (evt as CustomEvent<OpenEventDetail>).detail;
      if (!detail?.src) return;
      setSrc(detail.src);
      setTitle(detail.title || "Inspection");
      setOpen(true);
    };

    const handleCloseEvent = () => {
      handleClose();
    };

    window.addEventListener("inspection:open", handleOpen);
    window.addEventListener("inspection:close", handleCloseEvent);

    return () => {
      window.removeEventListener("inspection:open", handleOpen);
      window.removeEventListener("inspection:close", handleCloseEvent);
    };
  }, [handleClose]);

  return (
    <InspectionModal
      open={open}
      onClose={handleClose}
      src={src}
      title={title}
    />
  );
}