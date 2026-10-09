"use client";

import { useEffect, useState } from "react";

import ActionButton from "@/features/shared/components/ActionButton";

const RUNTIME_STATUS_EVENT = "profixiq:pwa-runtime-status";
const RUNTIME_STATUS_REQUEST_EVENT = "profixiq:pwa-runtime-status-request";
const UPDATE_REQUEST_EVENT = "profixiq:pwa-update-request";

type RuntimeStatusDetail = {
  updateReady?: boolean;
  activatingUpdate?: boolean;
  pending?: number;
};

/** Navbar button that only renders while a service-worker update is waiting. */
export default function PwaUpdateButton() {
  const [status, setStatus] = useState({
    ready: false,
    activating: false,
    pending: 0,
  });

  useEffect(() => {
    const onRuntimeStatus = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeStatusDetail>).detail;
      setStatus({
        ready: Boolean(detail?.updateReady),
        activating: Boolean(detail?.activatingUpdate),
        pending: detail?.pending ?? 0,
      });
    };
    window.addEventListener(RUNTIME_STATUS_EVENT, onRuntimeStatus);
    window.dispatchEvent(new Event(RUNTIME_STATUS_REQUEST_EVENT));
    return () => {
      window.removeEventListener(RUNTIME_STATUS_EVENT, onRuntimeStatus);
    };
  }, []);

  if (!status.ready) return null;

  const blocked = status.activating || status.pending > 0;

  return (
    <ActionButton
      disabled={blocked}
      onClick={() => {
        if (blocked) return;
        window.dispatchEvent(new Event(UPDATE_REQUEST_EVENT));
      }}
      title={
        status.pending > 0
          ? "Finish syncing offline changes before updating"
          : "A new version is ready. Tap to update and reload."
      }
    >
      <span>
        {status.activating
          ? "Updating…"
          : status.pending > 0
            ? "Sync first"
            : "Update"}
      </span>
    </ActionButton>
  );
}
