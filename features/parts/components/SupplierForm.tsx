"use client";
import { useState, useTransition } from "react";
import { createSupplier } from "@/features/parts/lib/suppliers";

export function SupplierForm({ shopId }: { shopId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
            await createSupplier({ shop_id: shopId, name: name.trim(), email: email || undefined, phone: phone || undefined });
            window.location.reload();
          } catch (e: any) {
            setErr(e?.message ?? "Failed");
          }
        });
      }}
    >
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="grid md:grid-cols-3 gap-3">
        <label className="block md:col-span-1">
          <div className="text-sm font-medium mb-1">Name</div>
          <input className="border rounded w-full px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <div className="text-sm font-medium mb-1">Email</div>
          <input className="border rounded w-full px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm font-medium mb-1">Phone</div>
          <input className="border rounded w-full px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <button disabled={pending} className="px-3 py-2 rounded-xl bg-neutral-900 text-white">
        {pending ? "Saving…" : "Create Supplier"}
      </button>
    </form>
  );
}
