"use client";

import { useEffect, useState } from "react";

/** Pass in the ISO date you got back from /verify */
export default function OwnerPinBadge({ expiresAt }: { expiresAt?: string }) {
  const [remaining, setRemaining] = useState<string>("");

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) return setRemaining("0:00");
      const sec = Math.floor(ms / 1000);
      const m = Math.floor(sec / 60);
      const s = String(sec % 60).padStart(2, "0");
      setRemaining(`${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return null;

  return (
    <span className="inline-flex items-center rounded-full border border-green-600/60 bg-green-900/30 px-2 py-0.5 text-xs text-green-300">
      Unlocked · {remaining}
    </span>
  );
}