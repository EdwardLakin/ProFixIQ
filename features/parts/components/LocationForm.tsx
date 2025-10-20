"use client";
import { useState, useTransition } from "react";
import { createLocation } from "@/features/parts/lib/locations";

export function LocationForm({ shopId }: { shopId: string }) {
  const [code, setCode] = useState("MAIN");
  const [name, setName] = useState("Main Stock");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          try {
            await createLocation({ shop_id: shopId, code: code.trim(), name: name.trim() });
            window.location.reload();
          } catch (e: any) {
            setErr(e?.message ?? "Failed");
          }
        });
      }}
    >
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <div className="text-sm font-medium mb-1">Code</div>
          <input className="border rounded w-full px-3 py-2" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm font-medium mb-1">Name</div>
          <input className="border rounded w-full px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <button disabled={pending} className="px-3 py-2 rounded-xl bg-neutral-900 text-white">
        {pending ? "Saving…" : "Create Location"}
      </button>
    </form>
  );
}
