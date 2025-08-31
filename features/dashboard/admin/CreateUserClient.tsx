"use client";

import { useState } from "react";

export default function CreateUserClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [shopId, setShopId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName || null,
          role: role || null,
          shop_id: shopId || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to create user");
      setMsg("✅ User created");
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("");
      setShopId("");
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Unknown error";
      setMsg("❌ " + m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 text-white max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Create User</h1>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            type="email"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Temporary Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            type="password"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Full Name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            type="text"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Role</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            type="text"
            placeholder="e.g. owner, manager, advisor, tech, admin"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Shop ID</label>
          <input
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            type="text"
            placeholder="Optional"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create User"}
        </button>

        {msg ? <p className="text-sm mt-2">{msg}</p> : null}
      </form>
    </div>
  );
}
