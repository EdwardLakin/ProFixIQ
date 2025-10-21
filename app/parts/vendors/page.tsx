"use client";
import { useState } from "react";

export default function VendorKeysPage() {
  const [vendor, setVendor] = useState("partstech");
  const [apiKey, setApiKey] = useState("");

  const save = async () => {
    // TODO: call /api/vendors/save to encrypt & store per shop
    alert(`Would save key for ${vendor}: ${apiKey.slice(0,4)}…`);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Vendor Integrations</h1>
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 max-w-lg space-y-2">
        <label className="text-sm">Vendor</label>
        <select className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
          value={vendor} onChange={e=>setVendor(e.target.value)}>
          <option value="partstech">PartsTech</option>
          <option value="generic-email">Generic Email PO</option>
        </select>
        <label className="text-sm mt-2">API Key / Credential</label>
        <input className="w-full rounded border border-neutral-700 bg-neutral-900 p-2"
          placeholder="paste key…" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
        <div className="pt-2">
          <button className="rounded bg-orange-500 px-3 py-2 text-black" onClick={save}>Save</button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">Keys are stored per shop (encrypted at rest).</p>
    </div>
  );
}
